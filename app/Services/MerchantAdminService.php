<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\DomainException;
use App\Models\KycDocument;
use App\Models\LedgerEntry;
use App\Models\Merchant;
use App\Models\OutboxEvent;
use App\Models\Transaction;
use App\Models\User;
use App\Models\UserNotification;
use App\Models\Wallet;
use Illuminate\Support\Facades\DB;

final class MerchantAdminService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly SecurityService $security,
        private readonly QrisService $qris,
        private readonly AppConfigService $appConfig,
    ) {}

    public function getMerchantDashboard(User $user): array
    {
        $ownedMerchants = Merchant::query()
            ->with('settlementWallet')
            ->where('owner_user_id', $user->id)
            ->orderBy('created_at')
            ->get();

        $isOwner = $ownedMerchants->isNotEmpty();
        $merchants = $isOwner
            ? $ownedMerchants
            : Merchant::query()->with('settlementWallet')->orderBy('created_at')->get();

        $walletIds = $merchants->pluck('settlement_wallet_id')->all();

        $incomingQris = $walletIds !== []
            ? Transaction::query()
                ->whereIn('destination_wallet_id', $walletIds)
                ->where('transaction_type', 'QRIS')
                ->orderByDesc('created_at')
                ->limit(25)
                ->get()
            : collect();

        $settlements = $walletIds !== []
            ? Transaction::query()
                ->whereIn('source_wallet_id', $walletIds)
                ->where('transaction_type', 'MERCHANT_SETTLE')
                ->orderByDesc('created_at')
                ->limit(15)
                ->get()
            : collect();

        $merchantItems = $merchants->map(function (Merchant $m): array {
            $payload = $this->qris->buildQrisPayload($m->nmid, $m->merchant_name, $m->merchant_city, null, false);

            return [
                'id' => $m->id,
                'nmid' => $m->nmid,
                'merchant_name' => $m->merchant_name,
                'merchant_city' => $m->merchant_city,
                'category' => $m->category,
                'category_scale' => $m->category_scale,
                'mdr_bps' => $m->mdr_bps,
                'settlement_wallet_id' => $m->settlement_wallet_id,
                'balance' => (float) ($m->settlementWallet?->balance ?? 0),
                'static_qris_payload' => $payload,
                'static_qris_svg' => $this->qris->renderSvg($payload, 190),
            ];
        })->all();

        $totalBalance = array_sum(array_column($merchantItems, 'balance'));
        $totalGross = (float) $incomingQris->where('status', 'SUCCESS')->sum('amount');

        return [
            'is_owner' => $isOwner,
            'total_settlement_balance' => $totalBalance,
            'total_qris_gross' => $totalGross,
            'merchants' => $merchantItems,
            'incoming_qris' => $incomingQris,
            'settlements' => $settlements,
        ];
    }

    public function generateMerchantQr(string $merchantId, ?int $amount, bool $isDynamic): array
    {
        $merchant = Merchant::query()->find($merchantId);
        if (! $merchant) {
            throw new DomainException('MERCHANT_NOT_FOUND', 'Merchant tidak ditemukan.', 404);
        }

        $dynamic = $isDynamic && $amount !== null && $amount > 0;
        $payload = $this->qris->buildQrisPayload(
            $merchant->nmid,
            $merchant->merchant_name,
            $merchant->merchant_city,
            $dynamic ? $amount : null,
            $dynamic
        );

        return [
            'nmid' => $merchant->nmid,
            'merchant_name' => $merchant->merchant_name,
            'merchant_city' => $merchant->merchant_city,
            'is_dynamic' => $dynamic,
            'amount' => $dynamic ? $amount : null,
            'raw_qr_payload' => $payload,
            'qr_svg' => $this->qris->renderSvg($payload, 200),
        ];
    }

    public function settleMerchantBalance(
        User $user,
        array $data,
        string $idempotencyKey,
    ): Transaction {
        if (! $this->security->consumeTxAuthToken($data['tx_auth_token'], $user->id)) {
            throw new DomainException('TX_AUTH_INVALID', 'Token otorisasi PIN tidak valid atau kedaluwarsa.', 401);
        }

        $fee = (int) config('sakukilat.merchant_settlement_fee', 2500);
        $gross = (int) $data['amount'];
        if ($gross <= $fee) {
            throw new DomainException(
                'AMOUNT_TOO_SMALL',
                'Minimal pencairan instan harus lebih besar dari biaya settlement Rp'.number_format($fee, 0, ',', '.').'.',
                422
            );
        }

        return DB::transaction(function () use ($user, $data, $fee, $gross, $idempotencyKey): Transaction {
            $merchant = Merchant::query()->find($data['merchant_id']);
            if (! $merchant) {
                throw new DomainException('MERCHANT_NOT_FOUND', 'Merchant tidak ditemukan.', 404);
            }
            if ($merchant->owner_user_id !== $user->id) {
                throw new DomainException('FORBIDDEN', 'Hanya pemilik merchant yang dapat mencairkan dana.', 403);
            }

            $escrowId = $this->ledger->systemWalletId('SYSTEM_ESCROW');
            $feeId = $this->ledger->systemWalletId('SYSTEM_FEE');
            $netDisbursed = $gross - $fee;

            return $this->ledger->executeInTransaction([
                'user_id' => $user->id,
                'idempotency_key' => $idempotencyKey,
                'transaction_type' => 'MERCHANT_SETTLE',
                'amount' => $netDisbursed,
                'admin_fee' => $fee,
                'title' => "Pencairan Instan {$merchant->merchant_name} -> {$data['destination_bank']}",
                'category' => 'Settlement UMKM',
                'source_wallet_id' => $merchant->settlement_wallet_id,
                'destination_wallet_id' => $escrowId,
                'metadata' => [
                    'merchantId' => $merchant->id,
                    'destinationBank' => $data['destination_bank'],
                    'accountNumber' => $data['account_number'],
                    'grossDebited' => $gross,
                ],
                'legs' => [
                    [
                        'wallet_id' => $merchant->settlement_wallet_id,
                        'entry_type' => 'DEBIT',
                        'amount' => $gross,
                        'description' => "Pencairan instan ke {$data['destination_bank']}",
                    ],
                    [
                        'wallet_id' => $escrowId,
                        'entry_type' => 'CREDIT',
                        'amount' => $netDisbursed,
                        'description' => "Payout bank merchant {$data['account_number']}",
                    ],
                    [
                        'wallet_id' => $feeId,
                        'entry_type' => 'CREDIT',
                        'amount' => $fee,
                        'description' => 'Biaya pencairan instan SakuKilat Bisnis',
                    ],
                ],
            ]);
        });
    }

    public function getAdminOverview(): array
    {
        $totalDebit = (float) LedgerEntry::query()->where('entry_type', 'DEBIT')->sum('amount');
        $totalCredit = (float) LedgerEntry::query()->where('entry_type', 'CREDIT')->sum('amount');
        $totalEntries = LedgerEntry::query()->count();

        $systemWallets = Wallet::query()
            ->whereIn('wallet_type', ['SYSTEM_ESCROW', 'SYSTEM_FEE', 'SYSTEM_PPOB', 'SYSTEM_GENESIS'])
            ->orderBy('wallet_type')
            ->get();

        $kycQueue = KycDocument::query()
            ->with('user:id,phone_number')
            ->orderByRaw("CASE status WHEN 'PENDING' THEN 0 ELSE 1 END")
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        $outboxEvents = OutboxEvent::query()->orderByDesc('id')->limit(20)->get();

        $recentLedgerEntries = LedgerEntry::query()
            ->with(['transaction:id,reference_number', 'wallet:id,name'])
            ->orderByDesc('id')
            ->limit(25)
            ->get();

        $recentTransactions = Transaction::query()
            ->with('user:id,full_name')
            ->where('transaction_type', '!=', 'GENESIS')
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        $discrepancy = round(abs($totalDebit - $totalCredit), 2);

        return [
            'ledger_invariant' => [
                'balanced' => $discrepancy === 0.0,
                'total_debit' => $totalDebit,
                'total_credit' => $totalCredit,
                'discrepancy' => $discrepancy,
                'total_entries' => $totalEntries,
            ],
            'system_wallets' => $systemWallets,
            'kyc_queue' => $kycQueue,
            'outbox_events' => $outboxEvents,
            'recent_ledger_entries' => $recentLedgerEntries,
            'recent_transactions' => $recentTransactions,
            'app_config' => $this->appConfig->get(),
        ];
    }

    public function reverseTransaction(string $transactionId, string $reason): array
    {
        return DB::transaction(function () use ($transactionId, $reason): array {
            $orig = Transaction::query()->where('id', $transactionId)->lockForUpdate()->first();
            if (! $orig) {
                throw new DomainException('TRANSACTION_NOT_FOUND', 'Transaksi tidak ditemukan.', 404);
            }
            if ($orig->status === 'REVERSED') {
                throw new DomainException('ALREADY_REVERSED', 'Transaksi sudah di-reverse sebelumnya.', 409);
            }
            if ($orig->status !== 'SUCCESS' || $orig->transaction_type === 'GENESIS') {
                throw new DomainException(
                    'REVERSAL_NOT_ALLOWED',
                    'Hanya transaksi berstatus SUCCESS non-genesis yang dapat di-reverse.',
                    422
                );
            }

            $origLegs = LedgerEntry::query()
                ->where('transaction_id', $orig->id)
                ->orderBy('id')
                ->get();

            $reversalLegs = $origLegs->map(fn (LedgerEntry $l): array => [
                'wallet_id' => $l->wallet_id,
                'entry_type' => $l->entry_type === 'DEBIT' ? 'CREDIT' : 'DEBIT',
                'amount' => (float) $l->amount,
                'description' => "Auto-Reversal {$orig->reference_number}: {$reason}",
                'allow_locked' => true,
            ])->all();

            $reversalTx = $this->ledger->executeInTransaction([
                'user_id' => $orig->user_id,
                'counterparty_user_id' => $orig->counterparty_user_id,
                'idempotency_key' => "reversal-{$orig->id}",
                'transaction_type' => $orig->transaction_type,
                'amount' => (float) $orig->amount,
                'admin_fee' => (float) $orig->admin_fee,
                'title' => "Reversal: {$orig->title}",
                'category' => 'Auto-Reversal',
                'source_wallet_id' => $orig->destination_wallet_id,
                'destination_wallet_id' => $orig->source_wallet_id,
                'metadata' => [
                    'reversedTransactionId' => $orig->id,
                    'reversedReference' => $orig->reference_number,
                    'reason' => $reason,
                ],
                'legs' => $reversalLegs,
                'outbox_topic' => 'ledger.transaction.reversed',
            ]);

            $orig->update(['status' => 'REVERSED']);

            UserNotification::create([
                'user_id' => $orig->user_id,
                'channel' => 'IN_APP',
                'title' => 'Pengembalian Dana Otomatis (Reversal)',
                'body' => "Dana transaksi {$orig->reference_number} ({$orig->title}) dikembalikan otomatis.",
            ]);

            return [
                'original_id' => $orig->id,
                'reversal_transaction' => $reversalTx,
            ];
        });
    }
}
