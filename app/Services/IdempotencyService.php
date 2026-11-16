<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\DomainException;
use App\Models\IdempotencyKey;
use Closure;

final class IdempotencyService
{
    public function __construct(private readonly SecurityService $security) {}

    /**
     * @param  Closure(): array{status: int, body: array<string, mixed>}  $callback
     * @return array{replayed: bool, status: int, body: array<string, mixed>}
     */
    public function run(
        ?string $idempotencyKey,
        string $userId,
        string $endpoint,
        mixed $payload,
        Closure $callback,
    ): array {
        $key = trim((string) $idempotencyKey);
        if ($key === '') {
            throw new DomainException(
                'MISSING_IDEMPOTENCY_KEY',
                'Header X-Idempotency-Key wajib disertakan untuk mencegah pemotongan saldo ganda.',
                400
            );
        }

        if (strlen($key) < 8 || strlen($key) > 128) {
            throw new DomainException(
                'INVALID_IDEMPOTENCY_KEY',
                'Panjang X-Idempotency-Key harus 8–128 karakter.',
                400
            );
        }

        $reqHash = $this->security->hashPayload($payload);
        $existing = IdempotencyKey::query()->find($key);

        if ($existing) {
            if (
                $existing->user_id !== $userId
                || $existing->endpoint !== $endpoint
                || $existing->request_hash !== $reqHash
            ) {
                throw new DomainException(
                    'IDEMPOTENCY_CONFLICT',
                    'X-Idempotency-Key sudah digunakan untuk payload atau endpoint berbeda.',
                    409
                );
            }

            return [
                'replayed' => true,
                'status' => $existing->response_status,
                'body' => $existing->response_body,
            ];
        }

        $result = $callback();

        IdempotencyKey::query()->firstOrCreate(
            ['key' => $key],
            [
                'user_id' => $userId,
                'endpoint' => $endpoint,
                'request_hash' => $reqHash,
                'response_status' => $result['status'],
                'response_body' => $result['body'],
            ]
        );

        return [
            'replayed' => false,
            'status' => $result['status'],
            'body' => $result['body'],
        ];
    }
}
