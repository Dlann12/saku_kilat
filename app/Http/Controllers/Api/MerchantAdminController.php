<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Exceptions\DomainException;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\AppConfigService;
use App\Services\AuthService;
use App\Services\IdempotencyService;
use App\Services\MerchantAdminService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class MerchantAdminController extends Controller
{
    public function __construct(
        private readonly MerchantAdminService $merchantAdmin,
        private readonly AuthService $auth,
        private readonly IdempotencyService $idempotency,
        private readonly AppConfigService $appConfig,
    ) {}

    public function merchantDashboard(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json(['data' => $this->merchantAdmin->getMerchantDashboard($user)]);
    }

    public function merchantQris(Request $request): JsonResponse
    {
        $data = $request->validate([
            'merchant_id' => ['required', 'uuid'],
            'amount' => ['nullable', 'integer', 'min:1000', 'max:20000000'],
            'is_dynamic' => ['sometimes', 'boolean'],
        ]);

        return response()->json([
            'data' => $this->merchantAdmin->generateMerchantQr(
                $data['merchant_id'],
                isset($data['amount']) ? (int) $data['amount'] : null,
                (bool) ($data['is_dynamic'] ?? false)
            ),
        ]);
    }

    public function merchantSettle(Request $request): JsonResponse
    {
        $data = $request->validate([
            'merchant_id' => ['required', 'uuid'],
            'amount' => ['required', 'integer', 'min:10000', 'max:20000000'],
            'destination_bank' => ['required', 'string', 'min:2', 'max:40'],
            'account_number' => ['required', 'string', 'min:6', 'max:24'],
            'tx_auth_token' => ['required', 'string', 'min:10'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $key = $request->header('X-Idempotency-Key');

        $res = $this->idempotency->run(
            $key,
            $user->id,
            '/api/v1/merchant/settle',
            $data,
            function () use ($user, $data, $key): array {
                $tx = $this->merchantAdmin->settleMerchantBalance($user, $data, (string) $key);

                return ['status' => 201, 'body' => ['data' => $tx->toArray()]];
            }
        );

        return response()->json($res['body'], $res['status']);
    }

    public function adminOverview(): JsonResponse
    {
        return response()->json(['data' => $this->merchantAdmin->getAdminOverview()]);
    }

    public function adminKycReview(Request $request, string $id): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        if ($user->role !== 'ADMIN') {
            throw new DomainException('FORBIDDEN', 'Hanya Compliance Admin yang dapat meninjau KYC.', 403);
        }

        $data = $request->validate([
            'decision' => ['required', 'in:VERIFIED,REJECTED'],
            'rejection_reason' => ['nullable', 'string', 'max:240'],
        ]);

        $doc = $this->auth->reviewKyc($id, $data['decision'], $data['rejection_reason'] ?? null);

        return response()->json(['data' => $doc]);
    }

    public function adminReverseTx(Request $request, string $id): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        if ($user->role !== 'ADMIN') {
            throw new DomainException('FORBIDDEN', 'Hanya Compliance Admin yang dapat mengeksekusi Auto-Reversal.', 403);
        }

        $data = $request->validate([
            'reason' => ['sometimes', 'string', 'min:3', 'max:200'],
        ]);

        return response()->json([
            'data' => $this->merchantAdmin->reverseTransaction(
                $id,
                $data['reason'] ?? 'Timeout / Rekonsiliasi Harian Otomatis'
            ),
        ]);
    }

    public function adminConfigShow(): JsonResponse
    {
        return response()->json(['data' => $this->appConfig->get()]);
    }

    public function adminConfigUpdate(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $data = $request->validate([
            'permissions' => ['sometimes', 'array'],
            'permissions.allow_topup' => ['sometimes', 'boolean'],
            'permissions.allow_qris' => ['sometimes', 'boolean'],
            'permissions.allow_p2p_transfer' => ['sometimes', 'boolean'],
            'permissions.allow_bank_transfer' => ['sometimes', 'boolean'],
            'permissions.allow_ppob' => ['sometimes', 'boolean'],
            'permissions.allow_split_bill' => ['sometimes', 'boolean'],
            'permissions.allow_pockets' => ['sometimes', 'boolean'],
            'permissions.allow_kyc_submission' => ['sometimes', 'boolean'],
            'limits' => ['sometimes', 'array'],
            'limits.unverified_balance_limit' => ['sometimes', 'integer', 'min:100000', 'max:50000000'],
            'limits.verified_balance_limit' => ['sometimes', 'integer', 'min:500000', 'max:100000000'],
            'limits.bifast_monthly_free_quota' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'limits.bifast_fee_after_quota' => ['sometimes', 'integer', 'min:0', 'max:25000'],
        ]);

        return response()->json(['data' => $this->appConfig->update($user, $data)]);
    }

    public function markNotificationsRead(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        UserNotification::query()
            ->where('user_id', $user->id)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return response()->json(['data' => ['marked_read' => true]]);
    }
}
