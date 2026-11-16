<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\DomainException;
use App\Models\SplitBill;
use App\Models\SplitBillParticipant;
use App\Models\Transaction;
use App\Models\User;
use App\Models\UserNotification;
use App\Models\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class SplitBillService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly SecurityService $security,
        private readonly WalletService $wallets,
    ) {}

    public function listForUser(User $user): array
    {
        $bills = SplitBill::query()
            ->with(['creator:id,full_name', 'participants'])
            ->where('creator_user_id', $user->id)
            ->orWhereHas('participants', fn ($q) => $q->where('user_id', $user->id))
            ->orderByDesc('created_at')
            ->get();

        return $bills->map(function (SplitBill $b): array {
            $collected = (float) $b->participants->where('status', 'PAID')->sum('share_amount');

            return [
                'id' => $b->id,
                'creator_user_id' => $b->creator_user_id,
                'creator_name' => $b->creator->full_name,
                'title' => $b->title,
                'split_mode' => $b->split_mode,
                'total_amount' => (float) $b->total_amount,
                'collected_amount' => $collected,
                'items' => $b->items_json ?? [],
                'status' => $b->status,
                'created_at' => $b->created_at?->toIso8601String(),
                'participants' => $b->participants->map(fn ($p) => [
                    'id' => $p->id,
                    'user_id' => $p->user_id,
                    'display_name' => $p->display_name,
                    'phone_number' => $p->phone_number,
                    'share_amount' => (float) $p->share_amount,
                    'status' => $p->status,
                ])->values()->all(),
            ];
        })->all();
    }

    public function create(User $creator, array $data): SplitBill
    {
        return DB::transaction(function () use ($creator, $data): SplitBill {
            $peerPhones = collect($data['participant_phones'])
                ->map(fn (string $ph): string => $this->security->normalizePhone($ph))
                ->unique()
                ->filter(fn (string $ph): bool => $ph !== $creator->phone_number)
                ->values();

            if ($peerPhones->isEmpty()) {
                throw new DomainException('NO_PARTICIPANTS', 'Pilih minimal 1 teman SakuKilat selain diri sendiri.', 400);
            }

            $peers = User::query()
                ->whereIn('phone_number', $peerPhones->all())
                ->where('account_status', 'ACTIVE')
                ->where('role', '!=', 'SYSTEM')
                ->get();

            if ($peers->count() !== $peerPhones->count()) {
                throw new DomainException('PARTICIPANT_NOT_FOUND', 'Sebagian nomor teman belum terdaftar di SakuKilat.', 404);
            }

            $allUsers = collect([$creator])->merge($peers);
            $shares = [];
            foreach ($allUsers as $u) {
                $shares[$u->phone_number] = 0;
            }

            $computedTotal = 0;
            if ($data['split_mode'] === 'EQUAL') {
                $computedTotal = (int) ($data['total_amount'] ?? 0);
                if ($computedTotal <= 0) {
                    throw new DomainException('INVALID_AMOUNT', 'Total tagihan patungan wajib diisi.', 400);
                }
                $count = $allUsers->count();
                $base = intdiv($computedTotal, $count);
                $rem = $computedTotal - ($base * $count);

                foreach ($allUsers as $u) {
                    $extra = $rem > 0 ? 1 : 0;
                    if ($rem > 0) {
                        $rem--;
                    }
                    $shares[$u->phone_number] = $base + $extra;
                }
            } else {
                $items = $data['items'] ?? [];
                if ($items === []) {
                    throw new DomainException('NO_ITEMS', 'Mode Per Item membutuhkan minimal 1 item.', 400);
                }
                foreach ($items as $item) {
                    $assigned = collect($item['assigned_phones'])
                        ->map(fn (string $ph): string => $this->security->normalizePhone($ph))
                        ->unique()
                        ->values();

                    foreach ($assigned as $ph) {
                        if (! array_key_exists($ph, $shares)) {
                            throw new DomainException('INVALID_ITEM_ASSIGNEE', "Peserta {$ph} tidak terdaftar di patungan.", 400);
                        }
                    }

                    $price = (int) $item['price'];
                    $computedTotal += $price;
                    $perPerson = intdiv($price, $assigned->count());
                    $rem = $price - ($perPerson * $assigned->count());

                    foreach ($assigned as $ph) {
                        $extra = $rem > 0 ? 1 : 0;
                        if ($rem > 0) {
                            $rem--;
                        }
                        $shares[$ph] += $perPerson + $extra;
                    }
                }
            }

            $bill = SplitBill::create([
                'id' => (string) Str::uuid(),
                'creator_user_id' => $creator->id,
                'title' => trim($data['title']),
                'split_mode' => $data['split_mode'],
                'total_amount' => $computedTotal,
                'items_json' => $data['items'] ?? [],
                'status' => 'OPEN',
            ]);

            foreach ($allUsers as $u) {
                $share = $shares[$u->phone_number] ?? 0;
                if ($share <= 0) {
                    continue;
                }
                $isCreator = $u->id === $creator->id;
                SplitBillParticipant::create([
                    'id' => (string) Str::uuid(),
                    'split_bill_id' => $bill->id,
                    'user_id' => $u->id,
                    'display_name' => $u->full_name,
                    'phone_number' => $u->phone_number,
                    'share_amount' => $share,
                    'status' => $isCreator ? 'PAID' : 'PENDING',
                    'paid_at' => $isCreator ? now() : null,
                ]);

                if (! $isCreator) {
                    $formatted = number_format($share, 0, ',', '.');
                    UserNotification::create([
                        'user_id' => $u->id,
                        'channel' => 'IN_APP',
                        'title' => 'Tagihan Patungan Baru',
                        'body' => "{$creator->full_name} menagih patungan \"{$bill->title}\" sebesar Rp{$formatted}.",
                    ]);
                }
            }

            return $bill->load('participants');
        });
    }

    public function payShare(
        User $payer,
        string $splitBillId,
        array $data,
        string $idempotencyKey,
    ): Transaction {
        if (! $this->security->consumeTxAuthToken($data['tx_auth_token'], $payer->id)) {
            throw new DomainException('TX_AUTH_INVALID', 'Token otorisasi PIN tidak valid atau kedaluwarsa.', 401);
        }

        return DB::transaction(function () use ($payer, $splitBillId, $data, $idempotencyKey): Transaction {
            $bill = SplitBill::query()->where('id', $splitBillId)->lockForUpdate()->first();
            if (! $bill) {
                throw new DomainException('SPLIT_BILL_NOT_FOUND', 'Tagihan patungan tidak ditemukan.', 404);
            }

            $participant = SplitBillParticipant::query()
                ->where('split_bill_id', $bill->id)
                ->where('user_id', $payer->id)
                ->lockForUpdate()
                ->first();

            if (! $participant) {
                throw new DomainException('NOT_A_PARTICIPANT', 'Anda tidak terdaftar pada patungan ini.', 403);
            }
            if ($participant->status === 'PAID') {
                throw new DomainException('ALREADY_PAID', 'Bagian patungan Anda sudah lunas.', 409);
            }

            $sourceWallet = Wallet::query()
                ->where('id', $data['source_wallet_id'])
                ->where('user_id', $payer->id)
                ->first();

            if (! $sourceWallet) {
                throw new DomainException('WALLET_NOT_FOUND', 'Dompet sumber dana tidak valid.', 403);
            }

            $creator = User::query()->findOrFail($bill->creator_user_id);
            $creatorMain = Wallet::query()
                ->where('user_id', $creator->id)
                ->where('wallet_type', 'MAIN')
                ->firstOrFail();

            $shareAmount = (float) $participant->share_amount;
            $creatorLimit = $this->wallets->getBalanceLimitInfo($creator);

            if ($creatorLimit['balance_limit'] < $creatorLimit['current_total_balance'] + $shareAmount) {
                throw new DomainException('RECIPIENT_LIMIT_EXCEEDED', 'Saldo pembuat patungan akan melewati batas maksimal.', 422);
            }

            $tx = $this->ledger->executeInTransaction([
                'user_id' => $payer->id,
                'counterparty_user_id' => $creator->id,
                'idempotency_key' => $idempotencyKey,
                'transaction_type' => 'SPLIT_BILL',
                'amount' => $shareAmount,
                'admin_fee' => 0,
                'title' => "Bayar Patungan: {$bill->title}",
                'category' => 'Patungan',
                'source_wallet_id' => $sourceWallet->id,
                'destination_wallet_id' => $creatorMain->id,
                'metadata' => [
                    'splitBillId' => $bill->id,
                    'billTitle' => $bill->title,
                    'sourceWalletName' => $sourceWallet->name,
                ],
                'legs' => [
                    [
                        'wallet_id' => $sourceWallet->id,
                        'entry_type' => 'DEBIT',
                        'amount' => $shareAmount,
                        'description' => "Bayar patungan {$bill->title}",
                    ],
                    [
                        'wallet_id' => $creatorMain->id,
                        'entry_type' => 'CREDIT',
                        'amount' => $shareAmount,
                        'description' => "Terima patungan dari {$participant->display_name}",
                    ],
                ],
            ]);

            $participant->update([
                'status' => 'PAID',
                'paid_transaction_id' => $tx->id,
                'paid_at' => now(),
            ]);

            $remaining = SplitBillParticipant::query()
                ->where('split_bill_id', $bill->id)
                ->where('status', 'PENDING')
                ->count();

            if ($remaining === 0) {
                $bill->update(['status' => 'SETTLED']);
            }

            $formatted = number_format($shareAmount, 0, ',', '.');
            UserNotification::create([
                'user_id' => $creator->id,
                'channel' => 'IN_APP',
                'title' => 'Pembayaran Patungan Diterima',
                'body' => "{$participant->display_name} melunasi bagian \"{$bill->title}\" sebesar Rp{$formatted}.",
            ]);

            return $tx;
        });
    }
}
