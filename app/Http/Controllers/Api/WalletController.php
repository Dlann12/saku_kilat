<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\IdempotencyService;
use App\Services\SecurityService;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class WalletController extends Controller
{
    public function __construct(
        private readonly WalletService $wallets,
        private readonly IdempotencyService $idempotency,
        private readonly SecurityService $security,
    ) {}

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json(['data' => $this->wallets->listUserWallets($user)]);
    }

    public function createPocket(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:50'],
            'category_key' => ['sometimes', 'in:food,transport,savings,bills'],
            'target_amount' => ['nullable', 'integer', 'min:10000', 'max:20000000'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $pocket = $this->wallets->createPocket($user, $data);

        return response()->json(['data' => $pocket], 201);
    }

    public function updatePocket(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:50'],
            'target_amount' => ['sometimes', 'nullable', 'integer', 'min:10000', 'max:20000000'],
            'is_locked' => ['sometimes', 'boolean'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $updated = $this->wallets->updatePocket($user, $id, $data);

        return response()->json(['data' => $updated]);
    }

    public function move(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source_wallet_id' => ['required', 'uuid'],
            'destination_wallet_id' => ['required', 'uuid'],
            'amount' => ['required', 'integer', 'min:1000', 'max:20000000'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $key = $request->header('X-Idempotency-Key');

        $result = $this->idempotency->run(
            $key,
            $user->id,
            '/api/v1/wallets/move',
            $data,
            function () use ($user, $data, $key): array {
                $tx = $this->wallets->moveBalance(
                    $user,
                    $data['source_wallet_id'],
                    $data['destination_wallet_id'],
                    (int) $data['amount'],
                    (string) $key
                );

                return ['status' => 201, 'body' => ['data' => $tx->toArray()]];
            }
        );

        return response()->json($result['body'], $result['status']);
    }

    public function topupChannels(): JsonResponse
    {
        return response()->json(['data' => ['channels' => WalletService::TOPUP_CHANNELS]]);
    }

    public function createTopup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', 'in:'.implode(',', array_keys(WalletService::TOPUP_CHANNELS))],
            'amount' => ['required', 'integer', 'min:10000', 'max:20000000'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $order = $this->wallets->createTopupOrder($user, $data['channel'], (int) $data['amount']);

        return response()->json(['data' => $order], 201);
    }

    public function vaWebhook(Request $request): JsonResponse
    {
        $rawBody = $request->getContent();
        $data = $request->validate([
            'external_ref' => ['required', 'string', 'min:5'],
        ]);

        $res = $this->wallets->processTopupWebhook(
            $data['external_ref'],
            $rawBody,
            (string) $request->header('X-Timestamp', ''),
            (string) $request->header('X-Signature', '')
        );

        return response()->json(['data' => $res]);
    }

    public function triggerSandboxVa(Request $request): JsonResponse
    {
        $data = $request->validate([
            'external_ref' => ['required', 'string', 'min:5'],
        ]);

        $rawBody = json_encode(['external_ref' => $data['external_ref']], JSON_THROW_ON_ERROR);
        $timestamp = (string) time();
        $signature = $this->security->signWebhookHmac($rawBody, $timestamp);

        $res = $this->wallets->processTopupWebhook(
            $data['external_ref'],
            $rawBody,
            $timestamp,
            $signature
        );

        return response()->json([
            'data' => [
                ...$res,
                'hmac_trace' => [
                    'timestamp' => $timestamp,
                    'signature_prefix' => substr($signature, 0, 16).'...',
                ],
            ],
        ]);
    }
}
