<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\KycDocument;
use App\Models\Merchant;
use App\Models\SplitBill;
use App\Models\SplitBillParticipant;
use App\Models\User;
use App\Models\UserNotification;
use App\Models\Wallet;
use App\Services\LedgerService;
use App\Services\SecurityService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

final class DatabaseSeeder extends Seeder
{
    public const IDS = [
        'system' => '00000000-0000-4000-8000-000000000001',
        'dlan' => '10000000-0000-4000-8000-000000000001',
        'raka' => '10000000-0000-4000-8000-000000000002',
        'sari' => '10000000-0000-4000-8000-000000000003',
        'budi' => '10000000-0000-4000-8000-000000000004',
        'tania' => '10000000-0000-4000-8000-000000000005',
        'admin' => '10000000-0000-4000-8000-000000000006',
    ];

    public const WALLETS = [
        'genesis' => '20000000-0000-4000-8000-000000000001',
        'escrow' => '20000000-0000-4000-8000-000000000002',
        'fee' => '20000000-0000-4000-8000-000000000003',
        'ppob' => '20000000-0000-4000-8000-000000000004',
        'dlan_main' => '21000000-0000-4000-8000-000000000001',
        'dlan_food' => '21000000-0000-4000-8000-000000000002',
        'dlan_transport' => '21000000-0000-4000-8000-000000000003',
        'raka_main' => '22000000-0000-4000-8000-000000000001',
        'raka_food' => '22000000-0000-4000-8000-000000000002',
        'raka_bills' => '22000000-0000-4000-8000-000000000003',
        'sari_main' => '23000000-0000-4000-8000-000000000001',
        'sari_savings' => '23000000-0000-4000-8000-000000000002',
        'sari_bills' => '23000000-0000-4000-8000-000000000003',
        'budi_main' => '24000000-0000-4000-8000-000000000001',
        'budi_merchant' => '24000000-0000-4000-8000-000000000002',
        'kenangan_merchant' => '24000000-0000-4000-8000-000000000003',
        'tania_main' => '25000000-0000-4000-8000-000000000001',
        'admin_main' => '26000000-0000-4000-8000-000000000001',
    ];

    public function run(): void
    {
        $security = app(SecurityService::class);
        $ledger = app(LedgerService::class);
        $defaultPinHash = $security->hashPin('123456');

        DB::transaction(function () use ($security, $ledger, $defaultPinHash): void {
            $users = [
                ['id' => self::IDS['system'], 'phone' => '+6280000000000', 'name' => 'SakuKilat Core Treasury', 'email' => 'treasury@sakukilat.id', 'kyc' => 'VERIFIED', 'status' => 'SYSTEM', 'role' => 'SYSTEM', 'bio' => false],
                ['id' => self::IDS['dlan'], 'phone' => '+6285211223344', 'name' => 'Dlan Kusuma', 'email' => 'dlan@sakukilat.id', 'kyc' => 'VERIFIED', 'status' => 'ACTIVE', 'role' => 'USER', 'bio' => true],
                ['id' => self::IDS['raka'], 'phone' => '+6281234567890', 'name' => 'Raka Pratama', 'email' => 'raka@sakukilat.id', 'kyc' => 'VERIFIED', 'status' => 'ACTIVE', 'role' => 'USER', 'bio' => false],
                ['id' => self::IDS['sari'], 'phone' => '+6281398765432', 'name' => 'Sari Wulandari', 'email' => 'sari@sakukilat.id', 'kyc' => 'VERIFIED', 'status' => 'ACTIVE', 'role' => 'USER', 'bio' => true],
                ['id' => self::IDS['budi'], 'phone' => '+6281122334455', 'name' => 'Pak Budi Santoso', 'email' => 'budi.kopi@sakukilat.id', 'kyc' => 'VERIFIED', 'status' => 'ACTIVE', 'role' => 'MERCHANT', 'bio' => false],
                ['id' => self::IDS['tania'], 'phone' => '+6287812345678', 'name' => 'Tania Wijaya', 'email' => 'tania@sakukilat.id', 'kyc' => 'UNVERIFIED', 'status' => 'ACTIVE', 'role' => 'USER', 'bio' => false],
                ['id' => self::IDS['admin'], 'phone' => '+6281100009999', 'name' => 'Nadia Putri (Compliance)', 'email' => 'compliance@sakukilat.id', 'kyc' => 'VERIFIED', 'status' => 'ACTIVE', 'role' => 'ADMIN', 'bio' => true],
            ];

            foreach ($users as $u) {
                User::create([
                    'id' => $u['id'],
                    'phone_number' => $u['phone'],
                    'full_name' => $u['name'],
                    'email' => $u['email'],
                    'pin_hash' => $defaultPinHash,
                    'kyc_status' => $u['kyc'],
                    'account_status' => $u['status'],
                    'role' => $u['role'],
                    'biometric_enabled' => $u['bio'],
                    'active_device_id' => 'dev-'.substr($u['id'], -4),
                ]);
            }

            $verifiedKyc = [
                [self::IDS['dlan'], '1771011611990001', 'DLAN KUSUMA'],
                [self::IDS['raka'], '3273012105050002', 'RAKA PRATAMA'],
                [self::IDS['sari'], '3174015508990003', 'SARI WULANDARI'],
                [self::IDS['budi'], '1771021204880004', 'BUDI SANTOSO'],
                [self::IDS['admin'], '3171014402950005', 'NADIA PUTRI'],
            ];

            foreach ($verifiedKyc as [$uid, $nik, $ktpName]) {
                KycDocument::create([
                    'user_id' => $uid,
                    'nik_encrypted' => $security->encryptNik($nik),
                    'nik_hash' => $security->hashNik($nik),
                    'full_name_ktp' => $ktpName,
                    'ktp_image_url' => '/sandbox/ktp-verified.svg',
                    'selfie_image_url' => '/sandbox/selfie-verified.svg',
                    'liveness_score' => 98.80,
                    'status' => 'VERIFIED',
                    'verified_at' => now(),
                ]);
            }

            $walletRows = [
                [self::WALLETS['genesis'], self::IDS['system'], 'SYSTEM_GENESIS', 'Genesis Reserve Vault', 'system', 50_000_000_000, null, false],
                [self::WALLETS['escrow'], self::IDS['system'], 'SYSTEM_ESCROW', 'Escrow Float Bank Umum', 'system', 0, null, false],
                [self::WALLETS['fee'], self::IDS['system'], 'SYSTEM_FEE', 'Pendapatan Fee & MDR', 'system', 0, null, false],
                [self::WALLETS['ppob'], self::IDS['system'], 'SYSTEM_PPOB', 'Clearing Biller PPOB', 'system', 0, null, false],

                [self::WALLETS['dlan_main'], self::IDS['dlan'], 'MAIN', 'Saldo Utama', 'main', 0, null, false],
                [self::WALLETS['dlan_food'], self::IDS['dlan'], 'POCKET', 'Uang Makan', 'food', 0, 1_000_000, false],
                [self::WALLETS['dlan_transport'], self::IDS['dlan'], 'POCKET', 'Transportasi', 'transport', 0, 500_000, false],

                [self::WALLETS['raka_main'], self::IDS['raka'], 'MAIN', 'Saldo Utama', 'main', 0, null, false],
                [self::WALLETS['raka_food'], self::IDS['raka'], 'POCKET', 'Jajan Kampus', 'food', 0, 600_000, false],
                [self::WALLETS['raka_bills'], self::IDS['raka'], 'POCKET', 'Kos & Listrik', 'bills', 0, 1_200_000, false],

                [self::WALLETS['sari_main'], self::IDS['sari'], 'MAIN', 'Saldo Utama', 'main', 0, null, false],
                [self::WALLETS['sari_savings'], self::IDS['sari'], 'POCKET', 'Dana Darurat', 'savings', 0, 15_000_000, true],
                [self::WALLETS['sari_bills'], self::IDS['sari'], 'POCKET', 'Tagihan Bulanan', 'bills', 0, 1_500_000, false],

                [self::WALLETS['budi_main'], self::IDS['budi'], 'MAIN', 'Saldo Utama', 'main', 0, null, false],
                [self::WALLETS['budi_merchant'], self::IDS['budi'], 'MERCHANT_SETTLEMENT', 'Kas Warung Kopi Pak Budi', 'merchant', 0, null, false],
                [self::WALLETS['kenangan_merchant'], self::IDS['budi'], 'MERCHANT_SETTLEMENT', 'Settlement Kopi Kenangan Bengkulu', 'merchant', 0, null, false],

                [self::WALLETS['tania_main'], self::IDS['tania'], 'MAIN', 'Saldo Utama', 'main', 0, null, false],
                [self::WALLETS['admin_main'], self::IDS['admin'], 'MAIN', 'Saldo Utama', 'main', 0, null, false],
            ];

            foreach ($walletRows as [$wid, $uid, $type, $name, $cat, $bal, $target, $locked]) {
                Wallet::create([
                    'id' => $wid,
                    'user_id' => $uid,
                    'wallet_type' => $type,
                    'name' => $name,
                    'category_key' => $cat,
                    'balance' => $bal,
                    'target_amount' => $target,
                    'currency' => 'IDR',
                    'is_locked' => $locked,
                ]);
            }

            Merchant::create([
                'id' => '30000000-0000-4000-8000-000000000001',
                'owner_user_id' => self::IDS['budi'],
                'nmid' => 'ID1026177100011',
                'merchant_name' => 'Warung Kopi Pak Budi',
                'merchant_city' => 'Kota Bengkulu',
                'category' => 'Makanan & Minuman',
                'category_scale' => 'UMI',
                'mdr_bps' => 30,
                'settlement_wallet_id' => self::WALLETS['budi_merchant'],
            ]);
            Merchant::create([
                'id' => '30000000-0000-4000-8000-000000000002',
                'owner_user_id' => self::IDS['budi'],
                'nmid' => 'ID1026177100022',
                'merchant_name' => 'Kopi Kenangan Bengkulu',
                'merchant_city' => 'Kota Bengkulu',
                'category' => 'Makanan & Minuman',
                'category_scale' => 'UME',
                'mdr_bps' => 70,
                'settlement_wallet_id' => self::WALLETS['kenangan_merchant'],
            ]);
            Merchant::create([
                'id' => '30000000-0000-4000-8000-000000000003',
                'owner_user_id' => self::IDS['budi'],
                'nmid' => 'ID1026317100033',
                'merchant_name' => 'TransJakarta Harmoni',
                'merchant_city' => 'Jakarta Pusat',
                'category' => 'Transportasi',
                'category_scale' => 'UBE',
                'mdr_bps' => 70,
                'settlement_wallet_id' => self::WALLETS['budi_merchant'],
            ]);

            $daysAgo = fn (int $days, int $hour = 9) => now('Asia/Jakarta')->subDays($days)->setTime($hour, 15);

            // Genesis
            $ledger->executeInTransaction([
                'user_id' => self::IDS['system'],
                'idempotency_key' => 'seed-genesis-001',
                'reference_number' => 'SK-GENESIS-0001',
                'transaction_type' => 'GENESIS',
                'amount' => 50_000_000_000,
                'title' => 'Inisialisasi Escrow Float Bank Umum',
                'category' => 'Sistem',
                'source_wallet_id' => self::WALLETS['genesis'],
                'destination_wallet_id' => self::WALLETS['escrow'],
                'created_at' => $daysAgo(14, 8),
                'legs' => [
                    ['wallet_id' => self::WALLETS['genesis'], 'entry_type' => 'DEBIT', 'amount' => 50_000_000_000, 'description' => 'Genesis Vault allocation'],
                    ['wallet_id' => self::WALLETS['escrow'], 'entry_type' => 'CREDIT', 'amount' => 50_000_000_000, 'description' => 'Initial BI Escrow float reserve'],
                ],
            ]);

            // Dlan reconciled ledger: Total Rp 1.250.000 (Main 575k, Uang Makan 475k, Transportasi 200k)
            $ledger->executeInTransaction([
                'user_id' => self::IDS['dlan'],
                'idempotency_key' => 'seed-dlan-topup-mandiri',
                'reference_number' => 'SK-SEED-DLAN01',
                'transaction_type' => 'TOPUP',
                'amount' => 800_000,
                'title' => 'Top Up via Mandiri Virtual Account',
                'category' => 'Top Up',
                'source_wallet_id' => self::WALLETS['escrow'],
                'destination_wallet_id' => self::WALLETS['dlan_main'],
                'created_at' => $daysAgo(5, 9),
                'legs' => [
                    ['wallet_id' => self::WALLETS['escrow'], 'entry_type' => 'DEBIT', 'amount' => 800_000, 'description' => 'Escrow Mandiri VA'],
                    ['wallet_id' => self::WALLETS['dlan_main'], 'entry_type' => 'CREDIT', 'amount' => 800_000, 'description' => 'Top Up Saldo Utama Mandiri VA'],
                ],
            ]);

            $ledger->executeInTransaction([
                'user_id' => self::IDS['dlan'],
                'idempotency_key' => 'seed-dlan-move-makan',
                'reference_number' => 'SK-SEED-DLAN02',
                'transaction_type' => 'POCKET_MOVE',
                'amount' => 500_000,
                'title' => 'Alokasi ke Kantong Uang Makan',
                'category' => 'Kantong Pintar',
                'source_wallet_id' => self::WALLETS['dlan_main'],
                'destination_wallet_id' => self::WALLETS['dlan_food'],
                'created_at' => $daysAgo(4, 11),
                'legs' => [
                    ['wallet_id' => self::WALLETS['dlan_main'], 'entry_type' => 'DEBIT', 'amount' => 500_000, 'description' => 'Pindah ke Uang Makan'],
                    ['wallet_id' => self::WALLETS['dlan_food'], 'entry_type' => 'CREDIT', 'amount' => 500_000, 'description' => 'Terima alokasi Uang Makan'],
                ],
            ]);

            $ledger->executeInTransaction([
                'user_id' => self::IDS['dlan'],
                'idempotency_key' => 'seed-dlan-move-transport',
                'reference_number' => 'SK-SEED-DLAN03',
                'transaction_type' => 'POCKET_MOVE',
                'amount' => 225_000,
                'title' => 'Alokasi ke Kantong Transportasi',
                'category' => 'Kantong Pintar',
                'source_wallet_id' => self::WALLETS['dlan_main'],
                'destination_wallet_id' => self::WALLETS['dlan_transport'],
                'created_at' => $daysAgo(4, 11),
                'legs' => [
                    ['wallet_id' => self::WALLETS['dlan_main'], 'entry_type' => 'DEBIT', 'amount' => 225_000, 'description' => 'Pindah ke Transportasi'],
                    ['wallet_id' => self::WALLETS['dlan_transport'], 'entry_type' => 'CREDIT', 'amount' => 225_000, 'description' => 'Terima alokasi Transportasi'],
                ],
            ]);

            $ledger->executeInTransaction([
                'user_id' => self::IDS['dlan'],
                'counterparty_user_id' => self::IDS['budi'],
                'idempotency_key' => 'seed-dlan-qris-tj',
                'reference_number' => 'SK-SEED-DLAN04',
                'transaction_type' => 'QRIS',
                'amount' => 25_000,
                'title' => 'TransJakarta Harmoni',
                'category' => 'Transportasi',
                'source_wallet_id' => self::WALLETS['dlan_transport'],
                'destination_wallet_id' => self::WALLETS['budi_merchant'],
                'metadata' => ['merchantName' => 'TransJakarta Harmoni', 'merchantCity' => 'Jakarta Pusat', 'mdrFee' => 175],
                'created_at' => $daysAgo(2, 8),
                'legs' => [
                    ['wallet_id' => self::WALLETS['dlan_transport'], 'entry_type' => 'DEBIT', 'amount' => 25_000, 'description' => 'QRIS TransJakarta Harmoni'],
                    ['wallet_id' => self::WALLETS['budi_merchant'], 'entry_type' => 'CREDIT', 'amount' => 24_825, 'description' => 'QRIS settlement net MDR'],
                    ['wallet_id' => self::WALLETS['fee'], 'entry_type' => 'CREDIT', 'amount' => 175, 'description' => 'QRIS Issuer MDR 0.7%'],
                ],
            ]);

            $ledger->executeInTransaction([
                'user_id' => self::IDS['dlan'],
                'idempotency_key' => 'seed-dlan-topup-bca',
                'reference_number' => 'SK-SEED-DLAN05',
                'transaction_type' => 'TOPUP',
                'amount' => 500_000,
                'title' => 'Top Up via BCA Virtual Account',
                'category' => 'Top Up',
                'source_wallet_id' => self::WALLETS['escrow'],
                'destination_wallet_id' => self::WALLETS['dlan_main'],
                'metadata' => ['channel' => 'VA_BCA', 'vaNumber' => '3901011223344'],
                'created_at' => $daysAgo(1, 14),
                'legs' => [
                    ['wallet_id' => self::WALLETS['escrow'], 'entry_type' => 'DEBIT', 'amount' => 500_000, 'description' => 'Escrow BCA VA'],
                    ['wallet_id' => self::WALLETS['dlan_main'], 'entry_type' => 'CREDIT', 'amount' => 500_000, 'description' => 'Top Up Saldo Utama BCA VA'],
                ],
            ]);

            $ledger->executeInTransaction([
                'user_id' => self::IDS['dlan'],
                'counterparty_user_id' => self::IDS['budi'],
                'idempotency_key' => 'seed-dlan-qris-kenangan',
                'reference_number' => 'SK-SEED-DLAN06',
                'transaction_type' => 'QRIS',
                'amount' => 25_000,
                'title' => 'Kopi Kenangan Bengkulu',
                'category' => 'Makanan & Minuman',
                'source_wallet_id' => self::WALLETS['dlan_food'],
                'destination_wallet_id' => self::WALLETS['kenangan_merchant'],
                'metadata' => ['merchantName' => 'Kopi Kenangan Bengkulu', 'merchantCity' => 'Kota Bengkulu', 'mdrFee' => 175],
                'created_at' => $daysAgo(0, 9),
                'legs' => [
                    ['wallet_id' => self::WALLETS['dlan_food'], 'entry_type' => 'DEBIT', 'amount' => 25_000, 'description' => 'QRIS Kopi Kenangan Bengkulu'],
                    ['wallet_id' => self::WALLETS['kenangan_merchant'], 'entry_type' => 'CREDIT', 'amount' => 24_825, 'description' => 'QRIS settlement Kopi Kenangan'],
                    ['wallet_id' => self::WALLETS['fee'], 'entry_type' => 'CREDIT', 'amount' => 175, 'description' => 'QRIS Issuer MDR 0.7%'],
                ],
            ]);

            // Raka (Main 650k, Food 250k, Bills 400k)
            $ledger->executeInTransaction([
                'user_id' => self::IDS['raka'],
                'idempotency_key' => 'seed-raka-topup',
                'reference_number' => 'SK-SEED-RAKA01',
                'transaction_type' => 'TOPUP',
                'amount' => 1_300_000,
                'title' => 'Top Up via BNI Virtual Account',
                'category' => 'Top Up',
                'source_wallet_id' => self::WALLETS['escrow'],
                'destination_wallet_id' => self::WALLETS['raka_main'],
                'created_at' => $daysAgo(3, 10),
                'legs' => [
                    ['wallet_id' => self::WALLETS['escrow'], 'entry_type' => 'DEBIT', 'amount' => 1_300_000, 'description' => 'Escrow BNI VA Raka'],
                    ['wallet_id' => self::WALLETS['raka_main'], 'entry_type' => 'CREDIT', 'amount' => 1_300_000, 'description' => 'Top Up Saldo Utama Raka'],
                ],
            ]);
            $ledger->executeInTransaction([
                'user_id' => self::IDS['raka'],
                'idempotency_key' => 'seed-raka-move-1',
                'reference_number' => 'SK-SEED-RAKA02',
                'transaction_type' => 'POCKET_MOVE',
                'amount' => 250_000,
                'title' => 'Alokasi ke Jajan Kampus',
                'category' => 'Kantong Pintar',
                'source_wallet_id' => self::WALLETS['raka_main'],
                'destination_wallet_id' => self::WALLETS['raka_food'],
                'created_at' => $daysAgo(2, 10),
                'legs' => [
                    ['wallet_id' => self::WALLETS['raka_main'], 'entry_type' => 'DEBIT', 'amount' => 250_000, 'description' => 'Pindah ke Jajan Kampus'],
                    ['wallet_id' => self::WALLETS['raka_food'], 'entry_type' => 'CREDIT', 'amount' => 250_000, 'description' => 'Alokasi Jajan Kampus'],
                ],
            ]);
            $ledger->executeInTransaction([
                'user_id' => self::IDS['raka'],
                'idempotency_key' => 'seed-raka-move-2',
                'reference_number' => 'SK-SEED-RAKA03',
                'transaction_type' => 'POCKET_MOVE',
                'amount' => 400_000,
                'title' => 'Alokasi ke Kos & Listrik',
                'category' => 'Kantong Pintar',
                'source_wallet_id' => self::WALLETS['raka_main'],
                'destination_wallet_id' => self::WALLETS['raka_bills'],
                'created_at' => $daysAgo(2, 10),
                'legs' => [
                    ['wallet_id' => self::WALLETS['raka_main'], 'entry_type' => 'DEBIT', 'amount' => 400_000, 'description' => 'Pindah ke Kos & Listrik'],
                    ['wallet_id' => self::WALLETS['raka_bills'], 'entry_type' => 'CREDIT', 'amount' => 400_000, 'description' => 'Alokasi Kos & Listrik'],
                ],
            ]);

            // Sari (Main 4.2M, Dana Darurat 6.5M locked, Tagihan 850k + PLN Token)
            $ledger->executeInTransaction([
                'user_id' => self::IDS['sari'],
                'idempotency_key' => 'seed-sari-topup',
                'reference_number' => 'SK-SEED-SARI01',
                'transaction_type' => 'TOPUP',
                'amount' => 11_702_500,
                'title' => 'Gaji Bulanan via BRI Virtual Account',
                'category' => 'Top Up',
                'source_wallet_id' => self::WALLETS['escrow'],
                'destination_wallet_id' => self::WALLETS['sari_main'],
                'created_at' => $daysAgo(6, 8),
                'legs' => [
                    ['wallet_id' => self::WALLETS['escrow'], 'entry_type' => 'DEBIT', 'amount' => 11_702_500, 'description' => 'Escrow BRI VA Sari'],
                    ['wallet_id' => self::WALLETS['sari_main'], 'entry_type' => 'CREDIT', 'amount' => 11_702_500, 'description' => 'Top Up Gaji Sari'],
                ],
            ]);
            $ledger->executeInTransaction([
                'user_id' => self::IDS['sari'],
                'idempotency_key' => 'seed-sari-move-emergency',
                'reference_number' => 'SK-SEED-SARI02',
                'transaction_type' => 'POCKET_MOVE',
                'amount' => 6_500_000,
                'title' => 'Alokasi Dana Darurat',
                'category' => 'Kantong Pintar',
                'source_wallet_id' => self::WALLETS['sari_main'],
                'destination_wallet_id' => self::WALLETS['sari_savings'],
                'created_at' => $daysAgo(5, 9),
                'legs' => [
                    ['wallet_id' => self::WALLETS['sari_main'], 'entry_type' => 'DEBIT', 'amount' => 6_500_000, 'description' => 'Pindah ke Dana Darurat'],
                    ['wallet_id' => self::WALLETS['sari_savings'], 'entry_type' => 'CREDIT', 'amount' => 6_500_000, 'description' => 'Dana Darurat terkunci'],
                ],
            ]);
            $ledger->executeInTransaction([
                'user_id' => self::IDS['sari'],
                'idempotency_key' => 'seed-sari-move-bills',
                'reference_number' => 'SK-SEED-SARI03',
                'transaction_type' => 'POCKET_MOVE',
                'amount' => 1_002_500,
                'title' => 'Alokasi Tagihan Bulanan',
                'category' => 'Kantong Pintar',
                'source_wallet_id' => self::WALLETS['sari_main'],
                'destination_wallet_id' => self::WALLETS['sari_bills'],
                'created_at' => $daysAgo(5, 9),
                'legs' => [
                    ['wallet_id' => self::WALLETS['sari_main'], 'entry_type' => 'DEBIT', 'amount' => 1_002_500, 'description' => 'Pindah ke Tagihan Bulanan'],
                    ['wallet_id' => self::WALLETS['sari_bills'], 'entry_type' => 'CREDIT', 'amount' => 1_002_500, 'description' => 'Alokasi Tagihan'],
                ],
            ]);
            $ledger->executeInTransaction([
                'user_id' => self::IDS['sari'],
                'idempotency_key' => 'seed-sari-ppob-pln',
                'reference_number' => 'SK-SEED-SARI04',
                'transaction_type' => 'PPOB',
                'amount' => 150_000,
                'admin_fee' => 2500,
                'title' => 'Token Listrik PLN Rp150.000',
                'category' => 'Listrik PLN',
                'source_wallet_id' => self::WALLETS['sari_bills'],
                'destination_wallet_id' => self::WALLETS['ppob'],
                'metadata' => ['productCode' => 'PLN_150', 'customerNumber' => '54120987654', 'tokenNumber' => '4819-3302-9918-7741-5520'],
                'created_at' => $daysAgo(2, 19),
                'legs' => [
                    ['wallet_id' => self::WALLETS['sari_bills'], 'entry_type' => 'DEBIT', 'amount' => 152_500, 'description' => 'Beli Token PLN Rp150.000 + admin'],
                    ['wallet_id' => self::WALLETS['ppob'], 'entry_type' => 'CREDIT', 'amount' => 150_000, 'description' => 'Biller PLN Token'],
                    ['wallet_id' => self::WALLETS['fee'], 'entry_type' => 'CREDIT', 'amount' => 2_500, 'description' => 'Komisi PPOB PLN'],
                ],
            ]);

            // Pak Budi
            $ledger->executeInTransaction([
                'user_id' => self::IDS['budi'],
                'idempotency_key' => 'seed-budi-topup',
                'reference_number' => 'SK-SEED-BUDI01',
                'transaction_type' => 'TOPUP',
                'amount' => 1_150_000,
                'title' => 'Top Up Modal Usaha BSI VA',
                'category' => 'Top Up',
                'source_wallet_id' => self::WALLETS['escrow'],
                'destination_wallet_id' => self::WALLETS['budi_main'],
                'created_at' => $daysAgo(4, 7),
                'legs' => [
                    ['wallet_id' => self::WALLETS['escrow'], 'entry_type' => 'DEBIT', 'amount' => 1_150_000, 'description' => 'Escrow BSI VA Pak Budi'],
                    ['wallet_id' => self::WALLETS['budi_main'], 'entry_type' => 'CREDIT', 'amount' => 1_150_000, 'description' => 'Saldo Utama Pak Budi'],
                ],
            ]);

            // Tania (UNVERIFIED near Rp2M cap)
            $ledger->executeInTransaction([
                'user_id' => self::IDS['tania'],
                'idempotency_key' => 'seed-tania-topup',
                'reference_number' => 'SK-SEED-TANIA01',
                'transaction_type' => 'TOPUP',
                'amount' => 1_850_000,
                'title' => 'Top Up via BCA Virtual Account',
                'category' => 'Top Up',
                'source_wallet_id' => self::WALLETS['escrow'],
                'destination_wallet_id' => self::WALLETS['tania_main'],
                'created_at' => $daysAgo(1, 13),
                'legs' => [
                    ['wallet_id' => self::WALLETS['escrow'], 'entry_type' => 'DEBIT', 'amount' => 1_850_000, 'description' => 'Escrow BCA VA Tania'],
                    ['wallet_id' => self::WALLETS['tania_main'], 'entry_type' => 'CREDIT', 'amount' => 1_850_000, 'description' => 'Saldo Utama Tania'],
                ],
            ]);

            // Active Split Bill
            $bill = SplitBill::create([
                'id' => '40000000-0000-4000-8000-000000000001',
                'creator_user_id' => self::IDS['dlan'],
                'title' => 'Makan Siang Ayam Geprek Bersama',
                'split_mode' => 'EQUAL',
                'total_amount' => 120_000,
                'items_json' => [
                    ['name' => 'Paket Geprek Mozza x3', 'price' => 105_000],
                    ['name' => 'Es Teh Manis x3', 'price' => 15_000],
                ],
                'status' => 'OPEN',
            ]);
            SplitBillParticipant::create([
                'split_bill_id' => $bill->id,
                'user_id' => self::IDS['dlan'],
                'display_name' => 'Dlan Kusuma',
                'phone_number' => '+6285211223344',
                'share_amount' => 40_000,
                'status' => 'PAID',
                'paid_at' => now(),
            ]);
            SplitBillParticipant::create([
                'split_bill_id' => $bill->id,
                'user_id' => self::IDS['raka'],
                'display_name' => 'Raka Pratama',
                'phone_number' => '+6281234567890',
                'share_amount' => 40_000,
                'status' => 'PENDING',
            ]);
            SplitBillParticipant::create([
                'split_bill_id' => $bill->id,
                'user_id' => self::IDS['sari'],
                'display_name' => 'Sari Wulandari',
                'phone_number' => '+6281398765432',
                'share_amount' => 40_000,
                'status' => 'PENDING',
            ]);

            // Notifications
            UserNotification::create([
                'user_id' => self::IDS['dlan'],
                'channel' => 'IN_APP',
                'title' => 'Pembayaran QRIS Berhasil',
                'body' => 'Pembayaran Rp25.000 ke Kopi Kenangan Bengkulu dari kantong Uang Makan telah berhasil.',
            ]);
            UserNotification::create([
                'user_id' => self::IDS['dlan'],
                'channel' => 'IN_APP',
                'title' => 'Top Up BCA VA Masuk',
                'body' => 'Saldo Utama bertambah Rp500.000 melalui BCA Virtual Account.',
            ]);
            UserNotification::create([
                'user_id' => self::IDS['raka'],
                'channel' => 'IN_APP',
                'title' => 'Tagihan Patungan Baru',
                'body' => 'Dlan Kusuma mengundang Anda patungan Rp40.000 untuk Makan Siang Ayam Geprek Bersama.',
            ]);
        });
    }
}
