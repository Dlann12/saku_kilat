<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\DomainException;
use App\Models\LedgerEntry;
use App\Models\OutboxEvent;
use App\Models\Transaction;
use App\Models\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class LedgerService
{
    public function __construct(private readonly SecurityService $security) {}

    /**
     * @param  array<int, array{wallet_id: string, entry_type: 'DEBIT'|'CREDIT', amount: float|int, description: string, allow_locked?: bool}>  $legs
     */
    public function validateBalancedLegs(array $legs): void
    {
        if (count($legs) < 2) {
            throw new DomainException('LEDGER_MIN_LEGS', 'Double-entry wajib memiliki minimal 2 kaki entri.', 400);
        }

        $debitCents = 0;
        $creditCents = 0;

        foreach ($legs as $leg) {
            $amount = (float) ($leg['amount'] ?? 0);
            if ($amount <= 0 || ! is_finite($amount)) {
                throw new DomainException('INVALID_LEG_AMOUNT', 'Nominal setiap baris buku besar harus positif.', 400);
            }
            $cents = (int) round($amount * 100);
            if ($leg['entry_type'] === 'DEBIT') {
                $debitCents += $cents;
            } else {
                $creditCents += $cents;
            }
        }

        if ($debitCents !== $creditCents) {
            throw new DomainException(
                'LEDGER_IMBALANCE',
                sprintf('Pelanggaran double-entry: DEBIT (%.2f) != CREDIT (%.2f).', $debitCents / 100, $creditCents / 100),
                500
            );
        }
    }

    /**
     * @param  array{
     *   user_id: string,
     *   counterparty_user_id?: string|null,
     *   idempotency_key: string,
     *   reference_number?: string,
     *   transaction_type: string,
     *   status?: string,
     *   amount: float|int,
     *   admin_fee?: float|int,
     *   title: string,
     *   category: string,
     *   source_wallet_id?: string|null,
     *   destination_wallet_id?: string|null,
     *   metadata?: array<string, mixed>,
     *   legs: array<int, array{wallet_id: string, entry_type: 'DEBIT'|'CREDIT', amount: float|int, description: string, allow_locked?: bool}>,
     *   outbox_topic?: string,
     *   created_at?: Carbon|null
     * }  $input
     */
    public function executeInTransaction(array $input): Transaction
    {
        $legs = $input['legs'];
        $this->validateBalancedLegs($legs);

        $amount = (float) $input['amount'];
        $adminFee = (float) ($input['admin_fee'] ?? 0);

        if ($amount <= 0) {
            throw new DomainException('INVALID_AMOUNT', 'Nominal transaksi harus lebih dari Rp0.', 400);
        }

        // Deterministic wallet locking order prevents deadlocks under concurrency
        $walletIds = collect($legs)->pluck('wallet_id')->unique()->sort()->values()->all();

        $wallets = Wallet::query()
            ->whereIn('id', $walletIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        $balancesCents = [];
        foreach ($walletIds as $wid) {
            $wallet = $wallets->get($wid);
            if (! $wallet) {
                throw new DomainException('WALLET_NOT_FOUND', "Dompet {$wid} tidak ditemukan.", 404);
            }
            $balancesCents[$wid] = (int) round(((float) $wallet->balance) * 100);
        }

        $snapshots = [];
        foreach ($legs as $leg) {
            $wid = $leg['wallet_id'];
            $wallet = $wallets->get($wid);
            assert($wallet !== null);

            if ($leg['entry_type'] === 'DEBIT' && $wallet->is_locked && ! ($leg['allow_locked'] ?? false)) {
                throw new DomainException(
                    'WALLET_LOCKED',
                    "Kantong \"{$wallet->name}\" sedang dikunci. Buka kunci terlebih dahulu.",
                    422
                );
            }

            $legCents = (int) round(((float) $leg['amount']) * 100);
            $beforeCents = $balancesCents[$wid];
            $afterCents = $leg['entry_type'] === 'DEBIT'
                ? $beforeCents - $legCents
                : $beforeCents + $legCents;

            if ($afterCents < 0) {
                throw new DomainException(
                    'INSUFFICIENT_BALANCE',
                    "Saldo pada \"{$wallet->name}\" tidak mencukupi.",
                    422
                );
            }

            $balancesCents[$wid] = $afterCents;
            $snapshots[] = [
                'wallet_id' => $wid,
                'entry_type' => $leg['entry_type'],
                'amount' => $legCents / 100,
                'balance_before' => $beforeCents / 100,
                'balance_after' => $afterCents / 100,
                'description' => $leg['description'],
            ];
        }

        $timestamp = $input['created_at'] ?? now();
        $reference = $input['reference_number'] ?? $this->security->generateReference();

        $transaction = Transaction::create([
            'id' => (string) Str::uuid(),
            'user_id' => $input['user_id'],
            'counterparty_user_id' => $input['counterparty_user_id'] ?? null,
            'idempotency_key' => $input['idempotency_key'],
            'reference_number' => $reference,
            'transaction_type' => $input['transaction_type'],
            'status' => $input['status'] ?? 'SUCCESS',
            'amount' => $amount,
            'admin_fee' => $adminFee,
            'total_amount' => $amount + $adminFee,
            'title' => $input['title'],
            'category' => $input['category'],
            'source_wallet_id' => $input['source_wallet_id'] ?? null,
            'destination_wallet_id' => $input['destination_wallet_id'] ?? null,
            'metadata' => $input['metadata'] ?? [],
            'created_at' => $timestamp,
            'updated_at' => $timestamp,
        ]);

        foreach ($balancesCents as $wid => $cents) {
            Wallet::query()
                ->where('id', $wid)
                ->update([
                    'balance' => number_format($cents / 100, 2, '.', ''),
                    'updated_at' => now(),
                ]);
        }

        foreach ($snapshots as $snap) {
            LedgerEntry::create([
                'transaction_id' => $transaction->id,
                'wallet_id' => $snap['wallet_id'],
                'entry_type' => $snap['entry_type'],
                'amount' => $snap['amount'],
                'balance_before' => $snap['balance_before'],
                'balance_after' => $snap['balance_after'],
                'description' => $snap['description'],
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);
        }

        $topic = $input['outbox_topic'] ?? 'ledger.'.strtolower($input['transaction_type']).'.committed';
        OutboxEvent::create([
            'event_id' => (string) Str::uuid(),
            'topic' => $topic,
            'aggregate_type' => 'TRANSACTION',
            'aggregate_id' => $transaction->id,
            'payload' => [
                'transactionId' => $transaction->id,
                'referenceNumber' => $transaction->reference_number,
                'type' => $transaction->transaction_type,
                'amount' => $amount,
                'adminFee' => $adminFee,
                'userId' => $input['user_id'],
            ],
            'status' => 'PUBLISHED',
            'created_at' => $timestamp,
            'updated_at' => $timestamp,
        ]);

        return $transaction;
    }

    public function execute(array $input): Transaction
    {
        return DB::transaction(fn (): Transaction => $this->executeInTransaction($input));
    }

    public function systemWalletId(string $walletType): string
    {
        $wallet = Wallet::query()->where('wallet_type', $walletType)->first();
        if (! $wallet) {
            throw new DomainException('SYSTEM_WALLET_MISSING', "System wallet {$walletType} belum di-seed.", 500);
        }

        return $wallet->id;
    }
}
