<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\DomainException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

final class SecurityService
{
    public function normalizePhone(string $raw): string
    {
        $cleaned = preg_replace('/[\s\-().]/', '', trim($raw)) ?? '';
        if (str_starts_with($cleaned, '+62')) {
            return $cleaned;
        }
        if (str_starts_with($cleaned, '62')) {
            return '+'.$cleaned;
        }
        if (str_starts_with($cleaned, '0')) {
            return '+62'.substr($cleaned, 1);
        }
        if (str_starts_with($cleaned, '8')) {
            return '+62'.$cleaned;
        }

        return $cleaned;
    }

    public function maskRecipientName(string $fullName): string
    {
        $parts = preg_split('/\s+/', trim($fullName)) ?: [];
        if ($parts === []) {
            return '***';
        }
        if (count($parts) === 1) {
            $word = $parts[0];
            if (strlen($word) <= 2) {
                return substr($word, 0, 1).'***';
            }

            return substr($word, 0, 2).str_repeat('*', min(5, strlen($word) - 2));
        }

        $first = $parts[0];
        $second = $parts[1];
        $visible = substr($second, 0, min(2, strlen($second)));

        return "{$first} {$visible}*****";
    }

    public function hashPin(string $pin): string
    {
        return Hash::make($pin);
    }

    public function verifyPin(string $pin, string $hash): bool
    {
        return Hash::check($pin, $hash);
    }

    public function encryptNik(string $nik): string
    {
        return Crypt::encryptString($nik);
    }

    public function decryptNik(string $encrypted): string
    {
        return Crypt::decryptString($encrypted);
    }

    public function hashNik(string $nik): string
    {
        return hash('sha256', trim($nik));
    }

    public function hashPayload(mixed $payload): string
    {
        return hash('sha256', json_encode($this->sortKeysDeep($payload), JSON_THROW_ON_ERROR));
    }

    public function signWebhookHmac(string $rawBody, string $timestampSeconds, ?string $secret = null): string
    {
        $key = $secret ?? (string) config('sakukilat.webhook_hmac_secret');

        return hash_hmac('sha256', "{$timestampSeconds}.{$rawBody}", $key);
    }

    public function verifyWebhookHmac(
        string $rawBody,
        string $timestampSeconds,
        string $providedSignature,
        ?int $maxSkewSeconds = null,
        ?string $secret = null,
        ?int $nowSeconds = null,
    ): void {
        $maxSkew = $maxSkewSeconds ?? (int) config('sakukilat.webhook_replay_skew_seconds', 30);
        $now = $nowSeconds ?? time();

        if (! is_numeric($timestampSeconds)) {
            throw new DomainException('INVALID_TIMESTAMP', 'Timestamp webhook tidak valid.', 401);
        }

        if (abs($now - (int) $timestampSeconds) > $maxSkew) {
            throw new DomainException(
                'REPLAY_WINDOW_EXCEEDED',
                'Timestamp webhook melewati batas anti-replay 30 detik.',
                401
            );
        }

        $expected = $this->signWebhookHmac($rawBody, $timestampSeconds, $secret);
        if ($providedSignature === '' || ! hash_equals($expected, trim($providedSignature))) {
            throw new DomainException('INVALID_SIGNATURE', 'Tanda tangan HMAC webhook tidak valid.', 401);
        }
    }

    public function issueTxAuthToken(string $userId): array
    {
        $ttl = (int) config('sakukilat.tx_auth_ttl_seconds', 60);
        $token = 'txa_'.bin2hex(random_bytes(24));
        Cache::put("tx_auth:{$token}", $userId, $ttl);

        return [
            'tx_auth_token' => $token,
            'expires_in_seconds' => $ttl,
        ];
    }

    public function consumeTxAuthToken(string $token, string $userId): bool
    {
        if (! str_starts_with($token, 'txa_')) {
            return false;
        }
        $key = "tx_auth:{$token}";
        $stored = Cache::pull($key);

        return $stored === $userId;
    }

    public function generateNumericOtp(int $length = 6): string
    {
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= (string) random_int(0, 9);
        }

        return $out;
    }

    public function generateReference(string $prefix = 'SK'): string
    {
        return sprintf(
            '%s-%s-%s',
            $prefix,
            now('UTC')->format('YmdHis'),
            strtoupper(Str::random(6))
        );
    }

    private function sortKeysDeep(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        if (array_is_list($value)) {
            return array_map($this->sortKeysDeep(...), $value);
        }

        ksort($value);
        foreach ($value as $k => $v) {
            $value[$k] = $this->sortKeysDeep($v);
        }

        return $value;
    }
}
