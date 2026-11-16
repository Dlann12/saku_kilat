<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\DomainException;
use App\Models\KycDocument;
use App\Models\User;
use App\Models\UserNotification;
use App\Models\Wallet;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class AuthService
{
    public function __construct(private readonly SecurityService $security) {}

    public function requestOtp(string $rawPhone, string $channel = 'WHATSAPP'): array
    {
        $phone = $this->security->normalizePhone($rawPhone);
        $lockKey = "otp_lock:{$phone}";

        if (Cache::has($lockKey)) {
            throw new DomainException(
                'OTP_LOCKED',
                'Nomor HP diblokir sementara 15 menit karena 3x salah OTP.',
                429
            );
        }

        $ttl = (int) config('sakukilat.otp_ttl_seconds', 180);
        $code = $this->security->generateNumericOtp(6);

        Cache::put("otp_code:{$phone}", [
            'code' => $code,
            'channel' => $channel,
        ], $ttl);
        Cache::forget("otp_fail:{$phone}");

        $existingUser = User::query()->where('phone_number', $phone)->first();
        if ($existingUser) {
            UserNotification::create([
                'user_id' => $existingUser->id,
                'channel' => $channel,
                'title' => 'Kode OTP SakuKilat',
                'body' => "Kode OTP Anda adalah {$code}. Berlaku 180 detik. Jangan bagikan ke siapa pun.",
                'metadata' => ['type' => 'OTP'],
            ]);
        }

        $payload = [
            'phone_number' => $phone,
            'channel' => $channel,
            'expires_in_seconds' => $ttl,
            'is_registered' => $existingUser !== null,
        ];

        if (config('sakukilat.sandbox_otp_preview')) {
            $payload['sandbox_otp'] = $code;
        }

        return $payload;
    }

    public function verifyOtp(
        string $rawPhone,
        string $otpCode,
        string $purpose = 'REGISTER',
        ?string $deviceId = null,
    ): array {
        $phone = $this->security->normalizePhone($rawPhone);
        $lockKey = "otp_lock:{$phone}";

        if (Cache::has($lockKey)) {
            throw new DomainException(
                'OTP_LOCKED',
                'Nomor HP diblokir 15 menit karena 3x salah memasukkan OTP.',
                429
            );
        }

        /** @var array{code: string, channel: string}|null $stored */
        $stored = Cache::get("otp_code:{$phone}");
        if (! $stored) {
            throw new DomainException(
                'OTP_EXPIRED',
                'Kode OTP sudah kedaluwarsa atau belum diminta. Silakan minta ulang.',
                400
            );
        }

        $maxAttempts = (int) config('sakukilat.max_otp_attempts', 3);
        $lockoutSeconds = (int) config('sakukilat.lockout_seconds', 900);

        if (! hash_equals($stored['code'], trim($otpCode))) {
            $failKey = "otp_fail:{$phone}";
            $fails = ((int) Cache::get($failKey, 0)) + 1;
            Cache::put($failKey, $fails, $lockoutSeconds);

            if ($fails >= $maxAttempts) {
                Cache::put($lockKey, true, $lockoutSeconds);
                Cache::forget("otp_code:{$phone}");

                throw new DomainException(
                    'OTP_LOCKED',
                    'Salah OTP 3x. Nomor Anda diblokir selama 15 menit demi keamanan.',
                    429,
                    ['attempts_remaining' => 0]
                );
            }

            $remaining = $maxAttempts - $fails;

            throw new DomainException(
                'INVALID_OTP',
                "Kode OTP salah. Sisa percobaan: {$remaining}x.",
                422,
                ['attempts_remaining' => $remaining]
            );
        }

        Cache::forget("otp_code:{$phone}");
        Cache::forget("otp_fail:{$phone}");

        if ($purpose === 'LOGIN') {
            $user = User::query()->where('phone_number', $phone)->first();
            if ($user) {
                $resolvedDevice = $deviceId ?? 'web-'.Str::random(8);
                $user->update(['active_device_id' => $resolvedDevice]);

                return [
                    'verified' => true,
                    'mode' => 'LOGIN',
                    'user' => $user,
                ];
            }
        }

        $regToken = 'reg_'.bin2hex(random_bytes(24));
        Cache::put("reg_token:{$regToken}", $phone, 600);

        return [
            'verified' => true,
            'mode' => 'REGISTER',
            'registration_token' => $regToken,
            'phone_number' => $phone,
        ];
    }

    public function registerWithPin(array $data, ?string $deviceId = null): User
    {
        $phone = $this->security->normalizePhone($data['phone_number']);
        $storedPhone = Cache::get("reg_token:{$data['registration_token']}");

        if (! $storedPhone || $storedPhone !== $phone) {
            throw new DomainException(
                'INVALID_REG_TOKEN',
                'Token verifikasi OTP tidak valid atau sudah kedaluwarsa.',
                401
            );
        }

        $user = DB::transaction(function () use ($data, $phone, $deviceId): User {
            if (User::query()->where('phone_number', $phone)->exists()) {
                throw new DomainException('PHONE_ALREADY_REGISTERED', 'Nomor HP sudah terdaftar.', 409);
            }

            $user = User::create([
                'id' => (string) Str::uuid(),
                'phone_number' => $phone,
                'full_name' => trim($data['full_name']),
                'email' => ! empty($data['email']) ? trim($data['email']) : null,
                'pin_hash' => $this->security->hashPin($data['pin']),
                'kyc_status' => 'UNVERIFIED',
                'account_status' => 'ACTIVE',
                'role' => 'USER',
                'active_device_id' => $deviceId ?? 'web-'.Str::random(8),
            ]);

            Wallet::create([
                'id' => (string) Str::uuid(),
                'user_id' => $user->id,
                'wallet_type' => 'MAIN',
                'name' => 'Saldo Utama',
                'category_key' => 'main',
                'balance' => 0.00,
                'currency' => 'IDR',
                'is_locked' => false,
            ]);

            UserNotification::create([
                'user_id' => $user->id,
                'channel' => 'IN_APP',
                'title' => 'Selamat Datang di SakuKilat',
                'body' => 'Dompet utama Anda aktif dengan limit Rp2.000.000. Lakukan KYC e-KTP untuk limit Rp20.000.000.',
            ]);

            return $user;
        });

        Cache::forget("reg_token:{$data['registration_token']}");

        return $user;
    }

    public function loginWithPin(string $rawPhone, string $pin, ?string $deviceId = null): array
    {
        $phone = $this->security->normalizePhone($rawPhone);
        $user = User::query()->where('phone_number', $phone)->first();

        if (! $user || $user->account_status !== 'ACTIVE') {
            throw new DomainException('INVALID_CREDENTIALS', 'Nomor HP atau PIN tidak sesuai.', 401);
        }

        if ($user->pin_locked_until && $user->pin_locked_until->isFuture()) {
            $minutes = max(1, (int) ceil($user->pin_locked_until->diffInSeconds(now()) / 60));

            throw new DomainException(
                'PIN_LOCKED',
                "Akun terkunci sementara karena salah PIN berulang. Coba lagi dalam {$minutes} menit.",
                429
            );
        }

        $maxPinAttempts = (int) config('sakukilat.max_pin_attempts', 5);
        $lockoutSeconds = (int) config('sakukilat.lockout_seconds', 900);

        if (! $this->security->verifyPin($pin, $user->pin_hash)) {
            $attempts = $user->pin_attempts + 1;
            $lockedUntil = $attempts >= $maxPinAttempts ? now()->addSeconds($lockoutSeconds) : null;
            $user->update([
                'pin_attempts' => $attempts,
                'pin_locked_until' => $lockedUntil,
            ]);

            if ($lockedUntil) {
                throw new DomainException('PIN_LOCKED', 'PIN salah 5x. Akun diblokir selama 15 menit.', 429);
            }

            $left = $maxPinAttempts - $attempts;

            throw new DomainException('INVALID_CREDENTIALS', "PIN salah. Sisa percobaan: {$left}x.", 401);
        }

        $resolvedDevice = $deviceId ?? $user->active_device_id ?? 'web-'.Str::random(8);
        $deviceChanged = $user->active_device_id !== null && $user->active_device_id !== $resolvedDevice;

        $user->update([
            'pin_attempts' => 0,
            'pin_locked_until' => null,
            'active_device_id' => $resolvedDevice,
        ]);

        if ($deviceChanged) {
            UserNotification::create([
                'user_id' => $user->id,
                'channel' => 'IN_APP',
                'title' => 'Perangkat Aktif Diperbarui',
                'body' => "Sesi login berpindah ke perangkat {$resolvedDevice} (Device Binding aktif).",
            ]);
        }

        return [
            'user' => $user->fresh(),
            'device_changed' => $deviceChanged,
        ];
    }

    public function verifyPinForTx(User $user, string $pin): array
    {
        if ($user->pin_locked_until && $user->pin_locked_until->isFuture()) {
            throw new DomainException(
                'PIN_LOCKED',
                'Otorisasi PIN dikunci sementara selama 15 menit karena salah berulang.',
                429
            );
        }

        $maxAttempts = (int) config('sakukilat.max_pin_attempts', 5);
        $lockoutSeconds = (int) config('sakukilat.lockout_seconds', 900);

        if (! $this->security->verifyPin($pin, $user->pin_hash)) {
            $attempts = $user->pin_attempts + 1;
            $lockedUntil = $attempts >= $maxAttempts ? now()->addSeconds($lockoutSeconds) : null;
            $user->update([
                'pin_attempts' => $attempts,
                'pin_locked_until' => $lockedUntil,
            ]);

            throw new DomainException('INVALID_PIN', "PIN transaksi salah ({$attempts}/{$maxAttempts}).", 401);
        }

        $user->update([
            'pin_attempts' => 0,
            'pin_locked_until' => null,
        ]);

        return $this->security->issueTxAuthToken($user->id);
    }

    public function authorizeBiometricTx(User $user): array
    {
        if (! $user->biometric_enabled) {
            throw new DomainException('BIOMETRIC_DISABLED', 'Otorisasi biometrik belum diaktifkan pada akun ini.', 403);
        }

        return $this->security->issueTxAuthToken($user->id);
    }

    public function submitKyc(User $user, array $data): KycDocument
    {
        $nikEncrypted = $this->security->encryptNik($data['nik']);
        $nikHash = $this->security->hashNik($data['nik']);

        return DB::transaction(function () use ($user, $data, $nikEncrypted, $nikHash): KycDocument {
            $duplicate = KycDocument::query()
                ->where('nik_hash', $nikHash)
                ->where('status', 'VERIFIED')
                ->where('user_id', '!=', $user->id)
                ->exists();

            if ($duplicate) {
                throw new DomainException('NIK_ALREADY_USED', 'NIK e-KTP ini sudah terverifikasi pada akun lain.', 409);
            }

            $doc = KycDocument::create([
                'id' => (string) Str::uuid(),
                'user_id' => $user->id,
                'nik_encrypted' => $nikEncrypted,
                'nik_hash' => $nikHash,
                'full_name_ktp' => strtoupper(trim($data['full_name_ktp'])),
                'ktp_image_url' => $data['ktp_image_url'],
                'selfie_image_url' => $data['selfie_image_url'],
                'liveness_score' => 98.80,
                'status' => 'PENDING',
            ]);

            $user->update(['kyc_status' => 'PENDING']);

            UserNotification::create([
                'user_id' => $user->id,
                'channel' => 'IN_APP',
                'title' => 'Pengajuan KYC Diproses',
                'body' => 'Dokumen e-KTP dan verifikasi wajah Anda sedang ditinjau oleh tim kepatuhan.',
            ]);

            return $doc;
        });
    }

    public function reviewKyc(string $documentId, string $decision, ?string $rejectionReason = null): KycDocument
    {
        return DB::transaction(function () use ($documentId, $decision, $rejectionReason): KycDocument {
            $doc = KycDocument::query()->where('id', $documentId)->lockForUpdate()->first();
            if (! $doc) {
                throw new DomainException('KYC_NOT_FOUND', 'Dokumen KYC tidak ditemukan.', 404);
            }

            $doc->update([
                'status' => $decision,
                'rejection_reason' => $decision === 'REJECTED' ? $rejectionReason : null,
                'verified_at' => $decision === 'VERIFIED' ? now() : null,
            ]);

            User::query()->where('id', $doc->user_id)->update(['kyc_status' => $decision]);

            $msg = $decision === 'VERIFIED'
                ? 'KYC Disetujui! Limit saldo naik menjadi Rp20.000.000 dan fitur Transfer Bank BI-FAST aktif.'
                : 'Pengajuan KYC ditolak: '.($rejectionReason ?: 'Foto e-KTP kurang jelas.');

            UserNotification::create([
                'user_id' => $doc->user_id,
                'channel' => 'IN_APP',
                'title' => $decision === 'VERIFIED' ? 'KYC Berhasil Diverifikasi' : 'KYC Perlu Diulang',
                'body' => $msg,
            ]);

            return $doc->fresh();
        });
    }
}
