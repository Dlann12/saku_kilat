<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\DomainException;
use App\Models\Merchant;
use App\Models\Transaction;
use App\Models\User;
use App\Models\UserNotification;
use App\Models\Wallet;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class PaymentService
{
    public const PPOB_CATALOG = [
        ['code' => 'PULSA_TSEL_25', 'category' => 'PULSA', 'name' => 'Pulsa Telkomsel 25.000', 'provider' => 'Telkomsel', 'base_price' => 24500, 'admin_fee' => 1500, 'description' => 'Masa aktif +30 hari'],
        ['code' => 'PULSA_TSEL_50', 'category' => 'PULSA', 'name' => 'Pulsa Telkomsel 50.000', 'provider' => 'Telkomsel', 'base_price' => 49000, 'admin_fee' => 1500, 'description' => 'Masa aktif +45 hari'],
        ['code' => 'DATA_ISAT_12GB', 'category' => 'DATA', 'name' => 'Freedom Internet 12 GB / 30 Hari', 'provider' => 'Indosat Ooredoo', 'base_price' => 48000, 'admin_fee' => 2000, 'description' => 'Kuota utama 24 jam'],
        ['code' => 'DATA_XL_20GB', 'category' => 'DATA', 'name' => 'Xtra Combo Flex 20 GB', 'provider' => 'XL Axiata', 'base_price' => 63000, 'admin_fee' => 2000, 'description' => 'Kuota utama + bonus area'],
        ['code' => 'PLN_TOKEN_50', 'category' => 'PLN_TOKEN', 'name' => 'Token Listrik PLN Rp50.000', 'provider' => 'PLN Prabayar', 'base_price' => 50000, 'admin_fee' => 2500, 'description' => 'Terbit 20 digit kode stroom instan'],
        ['code' => 'PLN_TOKEN_100', 'category' => 'PLN_TOKEN', 'name' => 'Token Listrik PLN Rp100.000', 'provider' => 'PLN Prabayar', 'base_price' => 100000, 'admin_fee' => 2500, 'description' => 'Terbit 20 digit kode stroom instan'],
        ['code' => 'PLN_TOKEN_200', 'category' => 'PLN_TOKEN', 'name' => 'Token Listrik PLN Rp200.000', 'provider' => 'PLN Prabayar', 'base_price' => 200000, 'admin_fee' => 2500, 'description' => 'Terbit 20 digit kode stroom instan'],
        ['code' => 'PLN_PASCABAYAR', 'category' => 'PLN_BILL', 'name' => 'Tagihan Listrik Pascabayar', 'provider' => 'PLN', 'base_price' => 184500, 'admin_fee' => 3000, 'description' => 'Tagihan bulanan periode berjalan'],
        ['code' => 'BPJS_KES', 'category' => 'BPJS', 'name' => 'Iuran BPJS Kesehatan Kelas I/II/III', 'provider' => 'BPJS Kesehatan', 'base_price' => 100000, 'admin_fee' => 2500, 'description' => 'Pembayaran iuran peserta JKN-KIS'],
        ['code' => 'PDAM_AIR', 'category' => 'PDAM', 'name' => 'Tagihan Air PDAM Tirta', 'provider' => 'PDAM Nasional', 'base_price' => 72500, 'admin_fee' => 2500, 'description' => 'Tagihan pemakaian air bersih'],
        ['code' => 'GAME_MLBB_172', 'category' => 'GAME', 'name' => 'Mobile Legends 172 Diamonds', 'provider' => 'Moonton', 'base_price' => 45000, 'admin_fee' => 2000, 'description' => 'Top up instan ke User ID + Zone'],
        ['code' => 'GAME_STEAM_60', 'category' => 'GAME', 'name' => 'Steam Wallet Code IDR 60.000', 'provider' => 'Valve Steam', 'base_price' => 60000, 'admin_fee' => 3500, 'description' => 'Kode redeem dikirim di resi'],
    ];

    public function __construct(
        private readonly LedgerService $ledger,
        private readonly SecurityService $security,
        private readonly QrisService $qris,
        private readonly WalletService $wallets,
        private readonly AppConfigService $appConfig,
    ) {}

    public function decodeQris(string $rawPayload): array
    {
        $parsed = $this->qris->parseQrisPayload($rawPayload);
        if (! $parsed['valid']) {
            throw new DomainException(
                'INVALID_QRIS',
                'Kode QR tidak valid atau bukan format QRIS standar nasional / SakuKilat.',
                422
            );
        }

        if ($parsed['kind'] === 'PROFILE' && ! empty($parsed['profile_phone'])) {
            return [
                'kind' => 'PROFILE',
                ...$this->lookupP2pRecipient($parsed['profile_phone']),
            ];
        }

        $merchant = Merchant::query()
            ->where('nmid', $parsed['nmid'])
            ->orWhereRaw('LOWER(merchant_name) = ?', [strtolower($parsed['merchant_name'])])
            ->first();

        $inquiryId = 'qri_'.bin2hex(random_bytes(12));
        $inquiryData = [
            'inquiry_id' => $inquiryId,
            'nmid' => $merchant?->nmid ?? $parsed['nmid'],
            'merchant_id' => $merchant?->id,
            'merchant_name' => $merchant?->merchant_name ?? $parsed['merchant_name'],
            'merchant_city' => $merchant?->merchant_city ?? $parsed['merchant_city'],
            'category' => $merchant?->category ?? 'Merchant QRIS',
            'category_scale' => $merchant?->category_scale ?? 'UMI',
            'mdr_bps' => $merchant?->mdr_bps ?? 70,
            'settlement_wallet_id' => $merchant?->settlement_wallet_id,
            'is_dynamic' => $parsed['is_dynamic'],
            'amount' => $parsed['amount'],
            'raw_payload' => $parsed['raw_payload'],
        ];

        Cache::put("qris_inquiry:{$inquiryId}", $inquiryData, 300);

        return [
            'kind' => 'QRIS',
            'inquiry_id' => $inquiryId,
            'nmid' => $inquiryData['nmid'],
            'merchant_name' => $inquiryData['merchant_name'],
            'merchant_city' => $inquiryData['merchant_city'],
            'category' => $inquiryData['category'],
            'is_dynamic' => $inquiryData['is_dynamic'],
            'amount' => $inquiryData['amount'],
            'admin_fee' => 0,
            'crc_valid' => $parsed['crc_valid'],
        ];
    }

    public function executeQrisPayment(
        User $user,
        array $data,
        string $idempotencyKey,
    ): Transaction {
        $this->appConfig->ensureEnabled('allow_qris', 'Pembayaran QRIS');

        if (! $this->security->consumeTxAuthToken($data['tx_auth_token'], $user->id)) {
            throw new DomainException(
                'TX_AUTH_INVALID',
                'Token otorisasi PIN kedaluwarsa (60 detik) atau tidak valid. Konfirmasi PIN ulang.',
                401
            );
        }

        $inquiry = ! empty($data['inquiry_id'])
            ? Cache::get("qris_inquiry:{$data['inquiry_id']}")
            : null;

        if (! $inquiry && ! empty($data['raw_qr_payload'])) {
            $decoded = $this->decodeQris($data['raw_qr_payload']);
            if ($decoded['kind'] !== 'QRIS') {
                throw new DomainException('INVALID_QRIS', 'QR Profil tidak dapat dibayar sebagai QRIS.', 400);
            }
            $inquiry = Cache::get("qris_inquiry:{$decoded['inquiry_id']}");
        }

        if (! is_array($inquiry)) {
            throw new DomainException('QRIS_INQUIRY_EXPIRED', 'Sesi QRIS kedaluwarsa. Pindai ulang kode QR.', 404);
        }

        $amount = (int) $data['amount'];
        if ($inquiry['is_dynamic'] && ! empty($inquiry['amount']) && (int) $inquiry['amount'] !== $amount) {
            throw new DomainException(
                'QRIS_AMOUNT_MISMATCH',
                'QRIS Dinamis mengunci nominal sebesar Rp'.number_format((int) $inquiry['amount'], 0, ',', '.').'.',
                422
            );
        }

        return DB::transaction(function () use ($user, $data, $inquiry, $amount, $idempotencyKey): Transaction {
            $sourceWallet = Wallet::query()
                ->where('id', $data['source_wallet_id'])
                ->where('user_id', $user->id)
                ->first();

            if (! $sourceWallet) {
                throw new DomainException('WALLET_NOT_FOUND', 'Dompet sumber dana tidak valid.', 403);
            }

            $destinationWalletId = $inquiry['settlement_wallet_id']
                ?: $this->ledger->systemWalletId('SYSTEM_ESCROW');
            $feeWalletId = $this->ledger->systemWalletId('SYSTEM_FEE');

            $effectiveBps = ($inquiry['category_scale'] === 'UMI' && $amount <= 500_000)
                ? 0
                : (int) $inquiry['mdr_bps'];

            $mdrFee = (int) round(($amount * $effectiveBps) / 10_000);
            $netMerchant = $amount - $mdrFee;

            $legs = [
                [
                    'wallet_id' => $sourceWallet->id,
                    'entry_type' => 'DEBIT',
                    'amount' => $amount,
                    'description' => "Bayar QRIS {$inquiry['merchant_name']}",
                ],
                [
                    'wallet_id' => $destinationWalletId,
                    'entry_type' => 'CREDIT',
                    'amount' => $netMerchant,
                    'description' => "Terima QRIS net MDR ({$inquiry['merchant_name']})",
                ],
            ];

            if ($mdrFee > 0) {
                $legs[] = [
                    'wallet_id' => $feeWalletId,
                    'entry_type' => 'CREDIT',
                    'amount' => $mdrFee,
                    'description' => 'Issuer MDR QRIS ('.($effectiveBps / 100).'%)',
                ];
            }

            $tx = $this->ledger->executeInTransaction([
                'user_id' => $user->id,
                'idempotency_key' => $idempotencyKey,
                'transaction_type' => 'QRIS',
                'amount' => $amount,
                'admin_fee' => 0,
                'title' => $inquiry['merchant_name'],
                'category' => $inquiry['category'],
                'source_wallet_id' => $sourceWallet->id,
                'destination_wallet_id' => $destinationWalletId,
                'metadata' => [
                    'nmid' => $inquiry['nmid'],
                    'merchantName' => $inquiry['merchant_name'],
                    'merchantCity' => $inquiry['merchant_city'],
                    'isDynamic' => $inquiry['is_dynamic'],
                    'mdrFee' => $mdrFee,
                    'sourceWalletName' => $sourceWallet->name,
                ],
                'legs' => $legs,
            ]);

            $formatted = number_format($amount, 0, ',', '.');
            UserNotification::create([
                'user_id' => $user->id,
                'channel' => 'IN_APP',
                'title' => 'Pembayaran QRIS Berhasil',
                'body' => "Pembayaran Rp{$formatted} ke {$inquiry['merchant_name']} dari {$sourceWallet->name} berhasil.",
            ]);

            return $tx;
        });
    }

    public function lookupP2pRecipient(string $rawPhone): array
    {
        $phone = $this->security->normalizePhone($rawPhone);
        $recipient = User::query()
            ->where('phone_number', $phone)
            ->where('role', '!=', 'SYSTEM')
            ->first();

        if (! $recipient || $recipient->account_status !== 'ACTIVE') {
            throw new DomainException('RECIPIENT_NOT_FOUND', "Nomor {$phone} belum terdaftar di SakuKilat.", 404);
        }

        return [
            'user_id' => $recipient->id,
            'phone_number' => $recipient->phone_number,
            'masked_name' => $this->security->maskRecipientName($recipient->full_name),
        ];
    }

    public function executeP2pTransfer(
        User $user,
        array $data,
        string $idempotencyKey,
    ): Transaction {
        $this->appConfig->ensureEnabled('allow_p2p_transfer', 'Transfer Sesama SakuKilat');

        if (! $this->security->consumeTxAuthToken($data['tx_auth_token'], $user->id)) {
            throw new DomainException('TX_AUTH_INVALID', 'Token otorisasi PIN tidak valid atau kedaluwarsa.', 401);
        }

        $phone = $this->security->normalizePhone($data['recipient_phone']);
        $amount = (int) $data['amount'];

        return DB::transaction(function () use ($user, $data, $phone, $amount, $idempotencyKey): Transaction {
            $sourceWallet = Wallet::query()
                ->where('id', $data['source_wallet_id'])
                ->where('user_id', $user->id)
                ->first();

            if (! $sourceWallet) {
                throw new DomainException('WALLET_NOT_FOUND', 'Dompet sumber dana tidak ditemukan.', 403);
            }

            $recipient = User::query()
                ->where('phone_number', $phone)
                ->where('account_status', 'ACTIVE')
                ->where('role', '!=', 'SYSTEM')
                ->first();

            if (! $recipient) {
                throw new DomainException('RECIPIENT_NOT_FOUND', 'Penerima SakuKilat tidak ditemukan.', 404);
            }
            if ($recipient->id === $user->id) {
                throw new DomainException('SELF_TRANSFER_NOT_ALLOWED', 'Tidak dapat transfer P2P ke akun sendiri.', 400);
            }

            $recMain = Wallet::query()
                ->where('user_id', $recipient->id)
                ->where('wallet_type', 'MAIN')
                ->firstOrFail();

            $recLimit = $this->wallets->getBalanceLimitInfo($recipient);
            if ($recLimit['balance_limit'] < $recLimit['current_total_balance'] + $amount) {
                throw new DomainException(
                    'RECIPIENT_LIMIT_EXCEEDED',
                    'Saldo penerima akan melebihi batas maksimal akun penerima.',
                    422
                );
            }

            $masked = $this->security->maskRecipientName($recipient->full_name);

            $tx = $this->ledger->executeInTransaction([
                'user_id' => $user->id,
                'counterparty_user_id' => $recipient->id,
                'idempotency_key' => $idempotencyKey,
                'transaction_type' => 'TRANSFER_P2P',
                'amount' => $amount,
                'admin_fee' => 0,
                'title' => "Transfer ke {$masked}",
                'category' => 'Transfer P2P',
                'source_wallet_id' => $sourceWallet->id,
                'destination_wallet_id' => $recMain->id,
                'metadata' => [
                    'recipientPhone' => $recipient->phone_number,
                    'recipientMaskedName' => $masked,
                    'notes' => $data['notes'] ?? '',
                    'sourceWalletName' => $sourceWallet->name,
                ],
                'legs' => [
                    [
                        'wallet_id' => $sourceWallet->id,
                        'entry_type' => 'DEBIT',
                        'amount' => $amount,
                        'description' => "Transfer P2P ke {$masked}",
                    ],
                    [
                        'wallet_id' => $recMain->id,
                        'entry_type' => 'CREDIT',
                        'amount' => $amount,
                        'description' => 'Terima Transfer P2P',
                    ],
                ],
            ]);

            $formatted = number_format($amount, 0, ',', '.');
            UserNotification::create([
                'user_id' => $recipient->id,
                'channel' => 'IN_APP',
                'title' => 'Transfer P2P Masuk',
                'body' => "Anda menerima transfer +Rp{$formatted} bebas biaya admin.",
            ]);

            return $tx;
        });
    }

    public function executeBankTransfer(
        User $user,
        array $data,
        string $idempotencyKey,
    ): array {
        $this->appConfig->ensureEnabled('allow_bank_transfer', 'Transfer Bank BI-FAST');

        if (! $this->security->consumeTxAuthToken($data['tx_auth_token'], $user->id)) {
            throw new DomainException('TX_AUTH_INVALID', 'Token otorisasi PIN kedaluwarsa atau tidak valid.', 401);
        }

        return DB::transaction(function () use ($user, $data, $idempotencyKey): array {
            $freshUser = User::query()->findOrFail($user->id);
            if ($freshUser->kyc_status !== 'VERIFIED') {
                throw new DomainException(
                    'KYC_REQUIRED',
                    'Transfer antar-bank (BI-FAST) hanya tersedia untuk akun berstatus KYC VERIFIED.',
                    403
                );
            }

            $sourceWallet = Wallet::query()
                ->where('id', $data['source_wallet_id'])
                ->where('user_id', $freshUser->id)
                ->first();

            if (! $sourceWallet) {
                throw new DomainException('WALLET_NOT_FOUND', 'Dompet sumber dana tidak valid.', 403);
            }

            $quota = $this->wallets->getMonthlyBiFastUsage($freshUser);
            $isFree = $quota['remaining_free'] > 0;
            $feeAfterQuota = (int) ($this->appConfig->get()['limits']['bifast_fee_after_quota'] ?? config('sakukilat.bifast_admin_fee', 2500));
            $adminFee = $isFree ? 0 : $feeAfterQuota;
            $amount = (int) $data['amount'];

            $escrowId = $this->ledger->systemWalletId('SYSTEM_ESCROW');
            $feeId = $this->ledger->systemWalletId('SYSTEM_FEE');

            $legs = [
                [
                    'wallet_id' => $sourceWallet->id,
                    'entry_type' => 'DEBIT',
                    'amount' => $amount + $adminFee,
                    'description' => "Transfer BI-FAST {$data['bank_code']} {$data['account_number']}",
                ],
                [
                    'wallet_id' => $escrowId,
                    'entry_type' => 'CREDIT',
                    'amount' => $amount,
                    'description' => "Outgoing BI-FAST ke {$data['bank_code']}",
                ],
            ];

            if ($adminFee > 0) {
                $legs[] = [
                    'wallet_id' => $feeId,
                    'entry_type' => 'CREDIT',
                    'amount' => $adminFee,
                    'description' => 'Biaya admin BI-FAST (kuota gratis habis)',
                ];
            }

            $tx = $this->ledger->executeInTransaction([
                'user_id' => $freshUser->id,
                'idempotency_key' => $idempotencyKey,
                'transaction_type' => 'TRANSFER_BANK',
                'amount' => $amount,
                'admin_fee' => $adminFee,
                'title' => "Transfer Bank {$data['bank_code']} - {$data['account_holder_name']}",
                'category' => 'Transfer Bank',
                'source_wallet_id' => $sourceWallet->id,
                'destination_wallet_id' => $escrowId,
                'metadata' => [
                    'bankCode' => $data['bank_code'],
                    'accountNumber' => $data['account_number'],
                    'accountHolderName' => $data['account_holder_name'],
                    'biFastFreeUsed' => $isFree,
                    'monthlySequence' => $quota['used_this_month'] + 1,
                    'notes' => $data['notes'] ?? '',
                    'sourceWalletName' => $sourceWallet->name,
                ],
                'legs' => $legs,
            ]);

            return [
                'transaction' => $tx,
                'bifast_quota_remaining_after' => max(0, $quota['free_quota'] - ($quota['used_this_month'] + 1)),
            ];
        });
    }

    public function inquirePpob(string $productCode, string $customerNumber): array
    {
        $product = collect(self::PPOB_CATALOG)->firstWhere('code', $productCode);
        if (! $product) {
            throw new DomainException('PPOB_PRODUCT_NOT_FOUND', 'Produk digital tidak ditemukan.', 404);
        }

        $maskedCustomer = in_array($product['category'], ['PULSA', 'DATA'], true)
            ? $this->security->normalizePhone($customerNumber)
            : 'PELANGGAN '.substr($customerNumber, 0, 4).'***';

        return [
            'product' => $product,
            'customer_number' => $customerNumber,
            'customer_name' => $maskedCustomer,
            'period' => 'November 2026',
            'base_price' => $product['base_price'],
            'admin_fee' => $product['admin_fee'],
            'total_payable' => $product['base_price'] + $product['admin_fee'],
        ];
    }

    public function executePpob(
        User $user,
        array $data,
        string $idempotencyKey,
    ): Transaction {
        $this->appConfig->ensureEnabled('allow_ppob', 'Pembelian & Tagihan PPOB');

        if (! $this->security->consumeTxAuthToken($data['tx_auth_token'], $user->id)) {
            throw new DomainException('TX_AUTH_INVALID', 'Token otorisasi PIN tidak valid atau kedaluwarsa.', 401);
        }

        $product = collect(self::PPOB_CATALOG)->firstWhere('code', $data['product_code']);
        if (! $product) {
            throw new DomainException('PPOB_PRODUCT_NOT_FOUND', 'Produk digital tidak ditemukan.', 404);
        }

        $tokenNumber = match ($product['category']) {
            'PLN_TOKEN' => implode('-', array_map(fn () => (string) random_int(1000, 9999), range(1, 5))),
            'GAME' => 'SKGAME-'.strtoupper(bin2hex(random_bytes(4))),
            default => null,
        };

        return DB::transaction(function () use ($user, $data, $product, $tokenNumber, $idempotencyKey): Transaction {
            $sourceWallet = Wallet::query()
                ->where('id', $data['source_wallet_id'])
                ->where('user_id', $user->id)
                ->first();

            if (! $sourceWallet) {
                throw new DomainException('WALLET_NOT_FOUND', 'Dompet sumber dana tidak valid.', 403);
            }

            $ppobWalletId = $this->ledger->systemWalletId('SYSTEM_PPOB');
            $feeWalletId = $this->ledger->systemWalletId('SYSTEM_FEE');

            $category = match ($product['category']) {
                'PLN_TOKEN', 'PLN_BILL' => 'Listrik PLN',
                'GAME' => 'Voucher Game',
                'BPJS' => 'BPJS Kesehatan',
                'PDAM' => 'PDAM',
                default => 'Pulsa & Data',
            };

            $tx = $this->ledger->executeInTransaction([
                'user_id' => $user->id,
                'idempotency_key' => $idempotencyKey,
                'transaction_type' => 'PPOB',
                'amount' => $product['base_price'],
                'admin_fee' => $product['admin_fee'],
                'title' => $product['name'],
                'category' => $category,
                'source_wallet_id' => $sourceWallet->id,
                'destination_wallet_id' => $ppobWalletId,
                'metadata' => [
                    'productCode' => $product['code'],
                    'provider' => $product['provider'],
                    'customerNumber' => $data['customer_number'],
                    'tokenNumber' => $tokenNumber,
                    'sourceWalletName' => $sourceWallet->name,
                ],
                'legs' => [
                    [
                        'wallet_id' => $sourceWallet->id,
                        'entry_type' => 'DEBIT',
                        'amount' => $product['base_price'] + $product['admin_fee'],
                        'description' => "Beli {$product['name']}",
                    ],
                    [
                        'wallet_id' => $ppobWalletId,
                        'entry_type' => 'CREDIT',
                        'amount' => $product['base_price'],
                        'description' => "Settlement Biller {$product['provider']}",
                    ],
                    [
                        'wallet_id' => $feeWalletId,
                        'entry_type' => 'CREDIT',
                        'amount' => $product['admin_fee'],
                        'description' => "Komisi PPOB {$product['code']}",
                    ],
                ],
            ]);

            UserNotification::create([
                'user_id' => $user->id,
                'channel' => 'IN_APP',
                'title' => 'Transaksi PPOB Berhasil',
                'body' => "{$product['name']} untuk {$data['customer_number']} berhasil."
                    .($tokenNumber ? " Kode/Token: {$tokenNumber}" : ''),
            ]);

            return $tx;
        });
    }

    public function listTransactions(User $user, array $filters = []): array
    {
        $limit = min(100, max(1, (int) ($filters['limit'] ?? 50)));
        $type = $filters['type'] ?? 'ALL';
        $directionFilter = $filters['direction'] ?? 'ALL';
        $search = trim((string) ($filters['q'] ?? ''));

        $query = Transaction::query()
            ->where(function ($q) use ($user): void {
                $q->where('user_id', $user->id)
                    ->orWhere(function ($sub) use ($user): void {
                        $sub->where('counterparty_user_id', $user->id)
                            ->whereIn('transaction_type', ['TRANSFER_P2P', 'SPLIT_BILL']);
                    });
            })
            ->where('transaction_type', '!=', 'GENESIS');

        if ($type !== 'ALL' && $type !== '') {
            $query->where('transaction_type', $type);
        }

        if ($search !== '') {
            $like = '%'.strtolower($search).'%';
            $query->where(function ($q) use ($like): void {
                $q->whereRaw('LOWER(title) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(reference_number) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(category) LIKE ?', [$like]);
            });
        }

        $rows = $query->orderByDesc('created_at')->limit($limit)->get();

        $mapped = $rows->map(function (Transaction $t) use ($user): array {
            $direction = match (true) {
                $t->transaction_type === 'TOPUP' => 'IN',
                $t->transaction_type === 'POCKET_MOVE' => 'INTERNAL',
                $t->counterparty_user_id === $user->id
                    && $t->user_id !== $user->id
                    && in_array($t->transaction_type, ['TRANSFER_P2P', 'SPLIT_BILL'], true) => 'IN',
                default => 'OUT',
            };

            $displayTitle = match (true) {
                $direction === 'IN' && $t->transaction_type === 'TRANSFER_P2P' => 'Terima Transfer SakuKilat',
                $direction === 'IN' && $t->transaction_type === 'SPLIT_BILL' => 'Terima Patungan: '.preg_replace('/^Bayar Patungan:\s*/i', '', $t->title),
                default => $t->title,
            };

            return [
                'id' => $t->id,
                'reference_number' => $t->reference_number,
                'transaction_type' => $t->transaction_type,
                'status' => $t->status,
                'amount' => (float) $t->amount,
                'admin_fee' => (float) $t->admin_fee,
                'total_amount' => (float) $t->total_amount,
                'title' => $displayTitle,
                'category' => $t->category,
                'direction' => $direction,
                'metadata' => $t->metadata ?? [],
                'created_at' => $t->created_at?->toIso8601String() ?? now()->toIso8601String(),
            ];
        });

        if (in_array($directionFilter, ['IN', 'OUT'], true)) {
            $mapped = $mapped->where('direction', $directionFilter)->values();
        }

        return $mapped->all();
    }

    public function getAnalyticsSummary(User $user): array
    {
        $rows = collect($this->listTransactions($user, ['limit' => 100]))
            ->where('status', 'SUCCESS');

        $totalIn = (float) $rows->where('direction', 'IN')->sum('amount');
        $totalOut = (float) $rows->where('direction', 'OUT')->sum('total_amount');

        $categories = $rows->where('direction', 'OUT')
            ->groupBy('category')
            ->map(function ($items, $category) use ($totalOut): array {
                $sum = (float) $items->sum('total_amount');

                return [
                    'category' => $category,
                    'amount' => $sum,
                    'share_percent' => $totalOut > 0 ? round(($sum / $totalOut) * 100, 1) : 0.0,
                ];
            })
            ->sortByDesc('amount')
            ->values()
            ->all();

        $dailySeries = [];
        for ($i = 6; $i >= 0; $i--) {
            $dt = now('Asia/Jakarta')->subDays($i);
            $iso = $dt->format('Y-m-d');
            $dailySeries[$iso] = [
                'label' => $dt->translatedFormat('d M'),
                'date_iso' => $iso,
                'out_amount' => 0.0,
                'in_amount' => 0.0,
            ];
        }

        foreach ($rows as $row) {
            $iso = substr($row['created_at'], 0, 10);
            if (! isset($dailySeries[$iso])) {
                continue;
            }
            if ($row['direction'] === 'IN') {
                $dailySeries[$iso]['in_amount'] += $row['amount'];
            } elseif ($row['direction'] === 'OUT') {
                $dailySeries[$iso]['out_amount'] += $row['total_amount'];
            }
        }

        return [
            'total_in' => $totalIn,
            'total_out' => $totalOut,
            'net_flow' => $totalIn - $totalOut,
            'transaction_count' => $rows->count(),
            'categories' => $categories,
            'daily_series' => array_values($dailySeries),
        ];
    }
}
