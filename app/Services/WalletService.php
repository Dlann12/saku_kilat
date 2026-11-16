<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\DomainException;
use App\Models\TopupOrder;
use App\Models\Transaction;
use App\Models\User;
use App\Models\UserNotification;
use App\Models\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class WalletService
{
    public const TOPUP_CHANNELS = [
        'VA_BCA' => ['label' => 'BCA Virtual Account', 'prefix' => '39010', 'fee' => 0, 'kind' => 'VA'],
        'VA_MANDIRI' => ['label' => 'Mandiri Virtual Account', 'prefix' => '88011', 'fee' => 0, 'kind' => 'VA'],
        'VA_BNI' => ['label' => 'BNI Virtual Account', 'prefix' => '88100', 'fee' => 0, 'kind' => 'VA'],
        'VA_BRI' => ['label' => 'BRI Virtual Account', 'prefix' => '88810', 'fee' => 0, 'kind' => 'VA'],
        'VA_BSI' => ['label' => 'BSI Virtual Account', 'prefix' => '90018', 'fee' => 0, 'kind' => 'VA'],
        'RETAIL_ALFAMART' => ['label' => 'Gerai Alfamart', 'prefix' => 'ALFA', 'fee' => 2500, 'kind' => 'RETAIL'],
        'RETAIL_INDOMARET' => ['label' => 'Gerai Indomaret', 'prefix' => 'INDM', 'fee' => 2500, 'kind' => 'RETAIL'],
        'DEBIT_INSTANT' => ['label' => 'Kartu Debit Instan', 'prefix' => 'DBT', 'fee' => 1000, 'kind' => 'DEBIT'],
    ];

    public function __construct(
        private readonly LedgerService $ledger,
        private readonly SecurityService $security,
        private readonly AppConfigService $appConfig,
    ) {}

    public function getBalanceLimitInfo(User $user): array
    {
        $total = (float) Wallet::query()
            ->where('user_id', $user->id)
            ->whereIn('wallet_type', ['MAIN', 'POCKET'])
            ->sum('balance');

        return [
            'kyc_status' => $user->kyc_status,
            'current_total_balance' => $total,
            'balance_limit' => $user->balanceLimit(),
        ];
    }

    public function getMonthlyBiFastUsage(User $user): array
    {
        $start = now('Asia/Jakarta')->startOfMonth()->utc();
        $end = now('Asia/Jakarta')->endOfMonth()->utc();

        $used = Transaction::query()
            ->where('user_id', $user->id)
            ->where('transaction_type', 'TRANSFER_BANK')
            ->where('status', 'SUCCESS')
            ->whereBetween('created_at', [$start, $end])
            ->count();

        $limits = $this->appConfig->get()['limits'];
        $freeQuota = (int) ($limits['bifast_monthly_free_quota'] ?? config('sakukilat.bifast_monthly_free_quota', 10));

        return [
            'used_this_month' => $used,
            'free_quota' => $freeQuota,
            'remaining_free' => max(0, $freeQuota - $used),
        ];
    }

    public function listUserWallets(User $user): array
    {
        $wallets = Wallet::query()
            ->where('user_id', $user->id)
            ->orderByRaw("CASE wallet_type WHEN 'MAIN' THEN 0 WHEN 'POCKET' THEN 1 ELSE 2 END")
            ->orderBy('created_at')
            ->get();

        $mainWallet = $wallets->firstWhere('wallet_type', 'MAIN');
        $pockets = $wallets->where('wallet_type', 'POCKET')->values();
        $mainBalance = (float) ($mainWallet?->balance ?? 0);
        $pocketsTotal = (float) $pockets->sum('balance');
        $biFastQuota = $this->getMonthlyBiFastUsage($user);

        $topupOrders = TopupOrder::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();

        return [
            'main_balance' => $mainBalance,
            'pockets_total' => $pocketsTotal,
            'total_balance' => $mainBalance + $pocketsTotal,
            'balance_limit' => $user->balanceLimit(),
            'kyc_status' => $user->kyc_status,
            'bifast_quota' => $biFastQuota,
            'main_wallet' => $mainWallet,
            'pockets' => $pockets,
            'wallets' => $wallets,
            'topup_orders' => $topupOrders,
        ];
    }

    public function createPocket(User $user, array $data): Wallet
    {
        $this->appConfig->ensureEnabled('allow_pockets', 'Kantong Pintar');

        $count = Wallet::query()
            ->where('user_id', $user->id)
            ->where('wallet_type', 'POCKET')
            ->count();

        if ($count >= 12) {
            throw new DomainException('POCKET_LIMIT_REACHED', 'Maksimal 12 Kantong Pintar aktif per akun.', 422);
        }

        return Wallet::create([
            'id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'wallet_type' => 'POCKET',
            'name' => trim($data['name']),
            'category_key' => $data['category_key'] ?? 'savings',
            'balance' => 0.00,
            'target_amount' => isset($data['target_amount']) ? (float) $data['target_amount'] : null,
            'currency' => 'IDR',
            'is_locked' => false,
        ]);
    }

    public function updatePocket(User $user, string $pocketId, array $data): Wallet
    {
        $wallet = Wallet::query()
            ->where('id', $pocketId)
            ->where('user_id', $user->id)
            ->first();

        if (! $wallet) {
            throw new DomainException('WALLET_NOT_FOUND', 'Kantong tidak ditemukan.', 404);
        }
        if ($wallet->wallet_type !== 'POCKET') {
            throw new DomainException('INVALID_WALLET_TYPE', 'Hanya Kantong Pintar yang dapat diubah.', 400);
        }

        if (array_key_exists('name', $data) && $data['name'] !== null) {
            $wallet->name = trim($data['name']);
        }
        if (array_key_exists('target_amount', $data)) {
            $wallet->target_amount = $data['target_amount'] !== null ? (float) $data['target_amount'] : null;
        }
        if (array_key_exists('is_locked', $data)) {
            $wallet->is_locked = (bool) $data['is_locked'];
        }
        $wallet->save();

        return $wallet;
    }

    public function moveBalance(
        User $user,
        string $sourceWalletId,
        string $destinationWalletId,
        int $amount,
        string $idempotencyKey,
    ): Transaction {
        $this->appConfig->ensureEnabled('allow_pockets', 'Kantong Pintar');

        if ($sourceWalletId === $destinationWalletId) {
            throw new DomainException('SAME_WALLET', 'Dompet sumber dan tujuan tidak boleh sama.', 400);
        }

        return DB::transaction(function () use ($user, $sourceWalletId, $destinationWalletId, $amount, $idempotencyKey): Transaction {
            $owned = Wallet::query()
                ->whereIn('id', [$sourceWalletId, $destinationWalletId])
                ->where('user_id', $user->id)
                ->get()
                ->keyBy('id');

            if ($owned->count() !== 2) {
                throw new DomainException(
                    'WALLET_OWNERSHIP_ERROR',
                    'Pemindahan saldo hanya diizinkan antar dompet milik Anda.',
                    403
                );
            }

            $src = $owned->get($sourceWalletId);
            $dst = $owned->get($destinationWalletId);
            assert($src !== null && $dst !== null);

            return $this->ledger->executeInTransaction([
                'user_id' => $user->id,
                'idempotency_key' => $idempotencyKey,
                'transaction_type' => 'POCKET_MOVE',
                'amount' => $amount,
                'admin_fee' => 0,
                'title' => "Pindah Saldo: {$src->name} -> {$dst->name}",
                'category' => 'Kantong Pintar',
                'source_wallet_id' => $src->id,
                'destination_wallet_id' => $dst->id,
                'metadata' => [
                    'sourceName' => $src->name,
                    'destinationName' => $dst->name,
                ],
                'legs' => [
                    [
                        'wallet_id' => $src->id,
                        'entry_type' => 'DEBIT',
                        'amount' => $amount,
                        'description' => "Pindah keluar ke {$dst->name}",
                    ],
                    [
                        'wallet_id' => $dst->id,
                        'entry_type' => 'CREDIT',
                        'amount' => $amount,
                        'description' => "Terima alokasi dari {$src->name}",
                    ],
                ],
            ]);
        });
    }

    public function createTopupOrder(User $user, string $channel, int $amount): TopupOrder
    {
        $this->appConfig->ensureEnabled('allow_topup', 'Top Up Saldo');

        $cfg = self::TOPUP_CHANNELS[$channel] ?? null;
        if (! $cfg) {
            throw new DomainException('INVALID_CHANNEL', 'Kanal Top Up tidak dikenal.', 400);
        }

        $digits = substr(preg_replace('/\D/', '', $user->phone_number) ?? '00000000', -8);
        $vaNumber = $cfg['kind'] === 'VA'
            ? $cfg['prefix'].$digits
            : $cfg['prefix'].'-'.substr($digits, -4).'-'.random_int(100, 999);

        $externalRef = 'TOPUP-'.now()->format('YmdHis').'-'.strtoupper(Str::random(6));

        return TopupOrder::create([
            'id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'channel' => $channel,
            'channel_label' => $cfg['label'],
            'va_number' => $vaNumber,
            'amount' => $amount,
            'admin_fee' => $cfg['fee'],
            'status' => 'PENDING',
            'external_ref' => $externalRef,
        ]);
    }

    public function processTopupWebhook(
        string $externalRef,
        string $rawBody,
        string $timestamp,
        string $signature,
    ): array {
        $this->security->verifyWebhookHmac($rawBody, $timestamp, $signature);

        return DB::transaction(function () use ($externalRef): array {
            $order = TopupOrder::query()
                ->where('external_ref', $externalRef)
                ->lockForUpdate()
                ->first();

            if (! $order) {
                throw new DomainException('ORDER_NOT_FOUND', 'Order Top Up tidak ditemukan.', 404);
            }
            if ($order->status === 'PAID') {
                return ['already_processed' => true, 'order_id' => $order->id, 'status' => 'PAID'];
            }
            if ($order->status !== 'PENDING') {
                throw new DomainException('INVALID_ORDER_STATUS', "Order Top Up berstatus {$order->status}.", 409);
            }

            $user = User::query()->findOrFail($order->user_id);
            $limitInfo = $this->getBalanceLimitInfo($user);
            $creditAmount = (float) $order->amount;
            $adminFee = (float) $order->admin_fee;

            if ($limitInfo['balance_limit'] < $limitInfo['current_total_balance'] + $creditAmount) {
                $order->update([
                    'status' => 'REJECTED',
                    'failure_reason' => 'LIMIT_EXCEEDED',
                ]);

                $formattedLimit = number_format($limitInfo['balance_limit'], 0, ',', '.');
                UserNotification::create([
                    'user_id' => $user->id,
                    'channel' => 'IN_APP',
                    'title' => 'Top Up Ditolak (Batas Saldo)',
                    'body' => "Top Up ditolak karena melebihi batas saldo akun {$user->kyc_status} (maks Rp{$formattedLimit}).",
                ]);

                throw new DomainException(
                    'LIMIT_EXCEEDED',
                    "Top Up ditolak: total saldo akan melebihi batas maksimal akun {$user->kyc_status} (Rp{$formattedLimit}). Lakukan KYC untuk batas Rp20.000.000.",
                    422,
                    $limitInfo
                );
            }

            $mainWallet = Wallet::query()
                ->where('user_id', $user->id)
                ->where('wallet_type', 'MAIN')
                ->firstOrFail();

            $escrowId = $this->ledger->systemWalletId('SYSTEM_ESCROW');
            $feeId = $this->ledger->systemWalletId('SYSTEM_FEE');

            $legs = [
                [
                    'wallet_id' => $escrowId,
                    'entry_type' => 'DEBIT',
                    'amount' => $creditAmount + $adminFee,
                    'description' => "Penerimaan dana {$order->channel_label} ({$order->va_number})",
                ],
                [
                    'wallet_id' => $mainWallet->id,
                    'entry_type' => 'CREDIT',
                    'amount' => $creditAmount,
                    'description' => "Top Up via {$order->channel_label}",
                ],
            ];

            if ($adminFee > 0) {
                $legs[] = [
                    'wallet_id' => $feeId,
                    'entry_type' => 'CREDIT',
                    'amount' => $adminFee,
                    'description' => "Biaya admin Top Up {$order->channel_label}",
                ];
            }

            $tx = $this->ledger->executeInTransaction([
                'user_id' => $user->id,
                'idempotency_key' => "webhook-topup-{$order->external_ref}",
                'transaction_type' => 'TOPUP',
                'amount' => $creditAmount,
                'admin_fee' => $adminFee,
                'title' => "Top Up via {$order->channel_label}",
                'category' => 'Top Up',
                'source_wallet_id' => $escrowId,
                'destination_wallet_id' => $mainWallet->id,
                'metadata' => [
                    'channel' => $order->channel,
                    'vaNumber' => $order->va_number,
                    'externalRef' => $order->external_ref,
                ],
                'legs' => $legs,
            ]);

            $order->update([
                'status' => 'PAID',
                'paid_at' => now(),
            ]);

            $formattedAmt = number_format($creditAmount, 0, ',', '.');
            UserNotification::create([
                'user_id' => $user->id,
                'channel' => 'IN_APP',
                'title' => 'Top Up Berhasil Masuk',
                'body' => "Saldo Utama bertambah +Rp{$formattedAmt} dari {$order->channel_label}.",
            ]);

            return [
                'already_processed' => false,
                'order_id' => $order->id,
                'status' => 'PAID',
                'transaction' => $tx,
            ];
        });
    }
}
