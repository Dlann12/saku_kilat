<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\LedgerEntry;
use App\Models\User;
use App\Services\QrisService;
use App\Services\SecurityService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class SakuKilatApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_us01_otp_registration_and_3x_wrong_otp_lockout(): void
    {
        $lockedPhone = '+6289900011122';
        $this->postJson('/api/v1/auth/otp/request', [
            'phone_number' => $lockedPhone,
            'channel' => 'WHATSAPP',
        ])->assertOk();

        for ($i = 0; $i < 2; $i++) {
            $this->postJson('/api/v1/auth/otp/verify', [
                'phone_number' => $lockedPhone,
                'otp_code' => '000000',
                'purpose' => 'REGISTER',
            ])->assertStatus(422);
        }

        $this->postJson('/api/v1/auth/otp/verify', [
            'phone_number' => $lockedPhone,
            'otp_code' => '000000',
            'purpose' => 'REGISTER',
        ])->assertStatus(429)->assertJsonPath('error.code', 'OTP_LOCKED');

        $this->postJson('/api/v1/auth/otp/request', [
            'phone_number' => $lockedPhone,
            'channel' => 'SMS',
        ])->assertStatus(429);

        // Happy registration
        $newPhone = '+6289988776655';
        $otpRes = $this->postJson('/api/v1/auth/otp/request', [
            'phone_number' => $newPhone,
            'channel' => 'WHATSAPP',
        ])->assertOk();

        $otp = $otpRes->json('data.sandbox_otp');
        $this->assertSame(6, strlen((string) $otp));

        $verRes = $this->postJson('/api/v1/auth/otp/verify', [
            'phone_number' => $newPhone,
            'otp_code' => $otp,
            'purpose' => 'REGISTER',
        ])->assertOk();

        $regRes = $this->postJson('/api/v1/auth/register', [
            'phone_number' => $newPhone,
            'full_name' => 'Andi Pratama',
            'email' => 'andi@sakukilat.id',
            'pin' => '246810',
            'registration_token' => $verRes->json('data.registration_token'),
        ])->assertStatus(201);

        $token = $regRes->json('data.token');
        $this->withToken($token)
            ->getJson('/api/v1/wallets')
            ->assertOk()
            ->assertJsonPath('data.main_balance', 0)
            ->assertJsonPath('data.balance_limit', 2000000);
    }

    public function test_us02_and_us03_kyc_limit_enforcement_and_hmac_va_webhook(): void
    {
        $tania = User::query()->findOrFail(DatabaseSeeder::IDS['tania']);
        $admin = User::query()->findOrFail(DatabaseSeeder::IDS['admin']);
        $security = app(SecurityService::class);

        Sanctum::actingAs($tania);

        // Tania starts UNVERIFIED with Rp1.850.000; Top Up Rp300.000 must fail LIMIT_EXCEEDED
        $orderFail = $this->postJson('/api/v1/topups', [
            'channel' => 'VA_BCA',
            'amount' => 300_000,
        ])->assertStatus(201);

        $body1 = json_encode(['external_ref' => $orderFail->json('data.external_ref')], JSON_THROW_ON_ERROR);
        $ts1 = (string) time();
        $sig1 = $security->signWebhookHmac($body1, $ts1);

        $this->call('POST', '/api/v1/webhooks/va', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_TIMESTAMP' => $ts1,
            'HTTP_X_SIGNATURE' => $sig1,
        ], $body1)->assertStatus(422)->assertJsonPath('error.code', 'LIMIT_EXCEEDED');

        // Submit KYC
        $kycRes = $this->postJson('/api/v1/kyc', [
            'nik' => '3175011204980009',
            'full_name_ktp' => 'TANIA WIJAYA',
            'ktp_image_url' => '/sandbox/ktp.png',
            'selfie_image_url' => '/sandbox/selfie.png',
            'liveness_passed' => true,
        ])->assertStatus(201);

        $docId = $kycRes->json('data.id');

        // Regular user cannot approve KYC (403)
        $this->postJson("/api/v1/admin/kyc/{$docId}/review", ['decision' => 'VERIFIED'])
            ->assertStatus(403);

        // Compliance Admin approves KYC
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/kyc/{$docId}/review", ['decision' => 'VERIFIED'])
            ->assertOk()
            ->assertJsonPath('data.status', 'VERIFIED');

        // Now Tania can top up Rp500.000 past Rp2M
        Sanctum::actingAs($tania->fresh());
        $orderOk = $this->postJson('/api/v1/topups', [
            'channel' => 'VA_MANDIRI',
            'amount' => 500_000,
        ])->assertStatus(201);

        $body2 = json_encode(['external_ref' => $orderOk->json('data.external_ref')], JSON_THROW_ON_ERROR);
        $ts2 = (string) time();
        $sig2 = $security->signWebhookHmac($body2, $ts2);

        $this->call('POST', '/api/v1/webhooks/va', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_TIMESTAMP' => $ts2,
            'HTTP_X_SIGNATURE' => $sig2,
        ], $body2)->assertOk()->assertJsonPath('data.status', 'PAID');

        $this->getJson('/api/v1/wallets')
            ->assertOk()
            ->assertJsonPath('data.balance_limit', 20000000)
            ->assertJsonPath('data.main_balance', 2350000);
    }

    public function test_us04_qris_smart_pockets_and_idempotency_conflict(): void
    {
        $dlan = User::query()->findOrFail(DatabaseSeeder::IDS['dlan']);
        Sanctum::actingAs($dlan);

        $pocket = $this->postJson('/api/v1/wallets/pockets', [
            'name' => 'Kopi Harian',
            'category_key' => 'food',
            'target_amount' => 250_000,
        ])->assertStatus(201)->json('data');

        $movePayload = [
            'source_wallet_id' => DatabaseSeeder::WALLETS['dlan_main'],
            'destination_wallet_id' => $pocket['id'],
            'amount' => 100_000,
        ];
        $idemKey = 'idem-move-123456';

        $this->withHeader('X-Idempotency-Key', $idemKey)
            ->postJson('/api/v1/wallets/move', $movePayload)
            ->assertStatus(201);

        // Identical replay succeeds without double debit
        $this->withHeader('X-Idempotency-Key', $idemKey)
            ->postJson('/api/v1/wallets/move', $movePayload)
            ->assertStatus(201);

        // Different payload with same idempotency key returns 409 conflict
        $this->withHeader('X-Idempotency-Key', $idemKey)
            ->postJson('/api/v1/wallets/move', [...$movePayload, 'amount' => 200_000])
            ->assertStatus(409);

        // Dynamic QRIS payment
        $qrString = app(QrisService::class)->buildQrisPayload('ID1026177100011', 'Warung Kopi Pak Budi', 'Kota Bengkulu', 35_000, true);
        $decoded = $this->postJson('/api/v1/payments/qris/decode', [
            'raw_qr_payload' => $qrString,
        ])->assertOk()->json('data');

        $pinRes = $this->postJson('/api/v1/auth/pin/verify', ['pin' => '123456'])->assertOk();

        $this->withHeader('X-Idempotency-Key', 'idem-qris-123456')
            ->postJson('/api/v1/payments/qris/execute', [
                'inquiry_id' => $decoded['inquiry_id'],
                'source_wallet_id' => $pocket['id'],
                'amount' => 35_000,
                'tx_auth_token' => $pinRes->json('data.tx_auth_token'),
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.status', 'SUCCESS');
    }

    public function test_us05_p2p_bifast_quota_ppob_split_bill_merchant_reversal_and_ledger_integrity(): void
    {
        $sari = User::query()->findOrFail(DatabaseSeeder::IDS['sari']);
        $raka = User::query()->findOrFail(DatabaseSeeder::IDS['raka']);
        $dlan = User::query()->findOrFail(DatabaseSeeder::IDS['dlan']);
        $budi = User::query()->findOrFail(DatabaseSeeder::IDS['budi']);
        $admin = User::query()->findOrFail(DatabaseSeeder::IDS['admin']);

        Sanctum::actingAs($sari);

        // P2P masked lookup & transfer
        $this->getJson('/api/v1/transfers/lookup?phone=081234567890')
            ->assertOk()
            ->assertJsonPath('data.masked_name', 'Raka Pr*****');

        $tok = $this->postJson('/api/v1/auth/pin/verify', ['pin' => '123456'])->json('data.tx_auth_token');
        $this->withHeader('X-Idempotency-Key', 'p2p-sari-001')
            ->postJson('/api/v1/transfers/p2p', [
                'recipient_phone' => '081234567890',
                'source_wallet_id' => DatabaseSeeder::WALLETS['sari_main'],
                'amount' => 50_000,
                'tx_auth_token' => $tok,
            ])->assertStatus(201)->assertJsonPath('data.admin_fee', 0);

        // 10 free BI-FAST + 11th Rp2.500 fee
        for ($i = 1; $i <= 10; $i++) {
            $t = $this->postJson('/api/v1/auth/pin/verify', ['pin' => '123456'])->json('data.tx_auth_token');
            $this->withHeader('X-Idempotency-Key', "bifast-{$i}-0001")
                ->postJson('/api/v1/transfers/bank', [
                    'bank_code' => 'BCA',
                    'account_number' => '8800112233',
                    'account_holder_name' => 'Sari Wulandari',
                    'source_wallet_id' => DatabaseSeeder::WALLETS['sari_main'],
                    'amount' => 10_000,
                    'tx_auth_token' => $t,
                ])->assertStatus(201)->assertJsonPath('data.admin_fee', 0);
        }

        $t11 = $this->postJson('/api/v1/auth/pin/verify', ['pin' => '123456'])->json('data.tx_auth_token');
        $this->withHeader('X-Idempotency-Key', 'bifast-11-0001')
            ->postJson('/api/v1/transfers/bank', [
                'bank_code' => 'MANDIRI',
                'account_number' => '1300012345678',
                'account_holder_name' => 'Sari Wulandari',
                'source_wallet_id' => DatabaseSeeder::WALLETS['sari_main'],
                'amount' => 10_000,
                'tx_auth_token' => $t11,
            ])->assertStatus(201)->assertJsonPath('data.admin_fee', 2500);

        // PPOB PLN Token
        Sanctum::actingAs($raka);
        $rakaTok = $this->postJson('/api/v1/auth/pin/verify', ['pin' => '123456'])->json('data.tx_auth_token');
        $ppob = $this->withHeader('X-Idempotency-Key', 'ppob-pln-0001')
            ->postJson('/api/v1/ppob/execute', [
                'product_code' => 'PLN_TOKEN_50',
                'customer_number' => '541200011122',
                'source_wallet_id' => DatabaseSeeder::WALLETS['raka_main'],
                'tx_auth_token' => $rakaTok,
            ])->assertStatus(201);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{4}-\d{4}-\d{4}-\d{4}$/', (string) $ppob->json('data.metadata.tokenNumber'));

        // Split bill create & pay
        Sanctum::actingAs($dlan);
        $bill = $this->postJson('/api/v1/split-bills', [
            'title' => 'Ngopi Tim',
            'split_mode' => 'ITEMIZED',
            'participant_phones' => ['+6281234567890'],
            'items' => [
                ['name' => 'Kopi Dlan', 'price' => 25_000, 'assigned_phones' => ['+6285211223344']],
                ['name' => 'Matcha Raka', 'price' => 30_000, 'assigned_phones' => ['+6281234567890']],
            ],
        ])->assertStatus(201)->json('data');

        Sanctum::actingAs($raka);
        $sbTok = $this->postJson('/api/v1/auth/pin/verify', ['pin' => '123456'])->json('data.tx_auth_token');
        $this->withHeader('X-Idempotency-Key', 'sb-pay-0001')
            ->postJson("/api/v1/split-bills/{$bill['id']}/pay", [
                'source_wallet_id' => DatabaseSeeder::WALLETS['raka_main'],
                'tx_auth_token' => $sbTok,
            ])->assertStatus(201);

        // Merchant Settle + Admin Auto-Reversal
        Sanctum::actingAs($budi);
        $budiTok = $this->postJson('/api/v1/auth/pin/verify', ['pin' => '123456'])->json('data.tx_auth_token');
        $settle = $this->withHeader('X-Idempotency-Key', 'settle-budi-001')
            ->postJson('/api/v1/merchant/settle', [
                'merchant_id' => '30000000-0000-4000-8000-000000000001',
                'amount' => 20_000,
                'destination_bank' => 'BRI',
                'account_number' => '009988776655',
                'tx_auth_token' => $budiTok,
            ])->assertStatus(201);

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/transactions/'.$settle->json('data.id').'/reverse', [
            'reason' => 'Simulasi rekonsiliasi otomatis',
        ])->assertOk();

        // Append-only trigger blocks UPDATE & DELETE on ledger_entries
        $entryId = LedgerEntry::query()->value('id');
        $updateBlocked = false;
        try {
            DB::table('ledger_entries')->where('id', $entryId)->update(['amount' => 999]);
        } catch (\Throwable) {
            $updateBlocked = true;
        }
        $this->assertTrue($updateBlocked, 'ledger_entries UPDATE must be blocked by DB trigger');

        // Verify global DEBIT == CREDIT
        $this->getJson('/api/v1/admin/overview')
            ->assertOk()
            ->assertJsonPath('data.ledger_invariant.balanced', true)
            ->assertJsonPath('data.ledger_invariant.discrepancy', 0);
    }
}
