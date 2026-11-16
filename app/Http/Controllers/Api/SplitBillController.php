<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\IdempotencyService;
use App\Services\SplitBillService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SplitBillController extends Controller
{
    public function __construct(
        private readonly SplitBillService $splitBills,
        private readonly IdempotencyService $idempotency,
    ) {}

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json(['data' => ['bills' => $this->splitBills->listForUser($user)]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'min:3', 'max:100'],
            'split_mode' => ['required', 'in:EQUAL,ITEMIZED'],
            'participant_phones' => ['required', 'array', 'min:1'],
            'participant_phones.*' => ['required', 'string', 'min:9'],
            'total_amount' => ['nullable', 'integer', 'min:1000', 'max:20000000'],
            'items' => ['nullable', 'array'],
            'items.*.name' => ['required_with:items', 'string', 'min:1', 'max:80'],
            'items.*.price' => ['required_with:items', 'integer', 'min:100'],
            'items.*.assigned_phones' => ['required_with:items', 'array', 'min:1'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $bill = $this->splitBills->create($user, $data);

        return response()->json(['data' => $bill], 201);
    }

    public function pay(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'source_wallet_id' => ['required', 'uuid'],
            'tx_auth_token' => ['required', 'string', 'min:10'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $key = $request->header('X-Idempotency-Key');

        $res = $this->idempotency->run(
            $key,
            $user->id,
            "/api/v1/split-bills/{$id}/pay",
            $data,
            function () use ($user, $id, $data, $key): array {
                $tx = $this->splitBills->payShare($user, $id, $data, (string) $key);

                return ['status' => 201, 'body' => ['data' => $tx->toArray()]];
            }
        );

        return response()->json($res['body'], $res['status']);
    }
}
