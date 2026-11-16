<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Exceptions\DomainException;
use App\Services\LedgerService;
use App\Services\QrisService;
use App\Services\SecurityService;
use Tests\TestCase;

final class LedgerAndQrisTest extends TestCase
{
    public function test_pin_hashing_and_nik_encryption_roundtrip(): void
    {
        $security = app(SecurityService::class);

        $hash = $security->hashPin('123456');
        $this->assertTrue($security->verifyPin('123456', $hash));
        $this->assertFalse($security->verifyPin('654321', $hash));

        $nik = '1771011611990001';
        $enc1 = $security->encryptNik($nik);
        $enc2 = $security->encryptNik($nik);
        $this->assertNotSame($enc1, $enc2);
        $this->assertSame($nik, $security->decryptNik($enc1));
        $this->assertSame(64, strlen($security->hashNik($nik)));
    }

    public function test_hmac_webhook_signature_and_anti_replay_window(): void
    {
        $security = app(SecurityService::class);
        $body = '{"external_ref":"TOPUP-123"}';
        $now = 1_760_000_000;
        $sig = $security->signWebhookHmac($body, (string) $now);

        $security->verifyWebhookHmac($body, (string) $now, $sig, 30, null, $now + 10);
        $this->assertTrue(true);

        $this->expectException(DomainException::class);
        $security->verifyWebhookHmac($body, (string) $now, $sig, 30, null, $now + 45);
    }

    public function test_qris_static_and_dynamic_payload_build_parse_and_crc(): void
    {
        $qris = app(QrisService::class);

        $static = $qris->buildQrisPayload('ID1026177100022', 'Kopi Kenangan Bengkulu', 'Kota Bengkulu', null, false);
        $parsedStatic = $qris->parseQrisPayload($static);
        $this->assertTrue($parsedStatic['valid']);
        $this->assertFalse($parsedStatic['is_dynamic']);
        $this->assertNull($parsedStatic['amount']);
        $this->assertSame('Kopi Kenangan Bengkulu', $parsedStatic['merchant_name']);

        $dynamic = $qris->buildQrisPayload('ID1026177100011', 'Warung Kopi Pak Budi', 'Kota Bengkulu', 38_000, true);
        $parsedDyn = $qris->parseQrisPayload($dynamic);
        $this->assertTrue($parsedDyn['valid']);
        $this->assertTrue($parsedDyn['is_dynamic']);
        $this->assertSame(38_000, $parsedDyn['amount']);

        $tampered = substr($dynamic, 0, -1).(str_ends_with($dynamic, '0') ? '1' : '0');
        $this->assertFalse($qris->parseQrisPayload($tampered)['valid']);
    }

    public function test_phone_normalization_and_recipient_masking(): void
    {
        $security = app(SecurityService::class);

        $this->assertSame('+6281234567890', $security->normalizePhone('0812-3456-7890'));
        $this->assertSame('Raka Pr*****', $security->maskRecipientName('Raka Pratama'));
    }

    public function test_ledger_rejects_imbalanced_legs(): void
    {
        $ledger = app(LedgerService::class);

        $this->expectException(DomainException::class);
        $ledger->validateBalancedLegs([
            ['wallet_id' => 'a', 'entry_type' => 'DEBIT', 'amount' => 50_000, 'description' => 'd'],
            ['wallet_id' => 'b', 'entry_type' => 'CREDIT', 'amount' => 49_999, 'description' => 'c'],
        ]);
    }
}
