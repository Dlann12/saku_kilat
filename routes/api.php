<?php

declare(strict_types=1);

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MerchantAdminController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\SplitBillController;
use App\Http\Controllers\Api\WalletController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('/health', function () {
        DB::select('SELECT 1');
        $redisStatus = 'ok';
        try {
            Redis::connection()->ping();
        } catch (Throwable) {
            $redisStatus = 'unavailable';
        }

        return response()->json([
            'data' => [
                'status' => 'ok',
                'service' => 'sakukilat-laravel-api-v1',
                'postgres' => 'connected',
                'redis' => $redisStatus,
                'timestamp' => now()->toIso8601String(),
            ],
        ]);
    });

    // Public Auth & Bank Webhook
    Route::get('/auth/session', [AuthController::class, 'session']);
    Route::post('/auth/demo-switch', [AuthController::class, 'demoSwitch']);
    Route::post('/auth/otp/request', [AuthController::class, 'otpRequest']);
    Route::post('/auth/otp/verify', [AuthController::class, 'otpVerify']);
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/webhooks/va', [WalletController::class, 'vaWebhook']);
    Route::get('/ppob/catalog', [PaymentController::class, 'ppobCatalog']);
    Route::get('/payments/qris/presets', [PaymentController::class, 'qrisPresets']);

    // Authenticated API (Sanctum Bearer Token OR Web Session Cookie)
    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::post('/auth/pin/verify', [AuthController::class, 'pinVerify']);
        Route::post('/auth/biometric', [AuthController::class, 'biometric']);

        Route::get('/kyc', [AuthController::class, 'kycShow']);
        Route::post('/kyc', [AuthController::class, 'kycSubmit']);

        Route::get('/wallets', [WalletController::class, 'index']);
        Route::post('/wallets/pockets', [WalletController::class, 'createPocket']);
        Route::patch('/wallets/pockets/{id}', [WalletController::class, 'updatePocket']);
        Route::post('/wallets/move', [WalletController::class, 'move']);

        Route::get('/topups', [WalletController::class, 'topupChannels']);
        Route::post('/topups', [WalletController::class, 'createTopup']);
        Route::post('/sandbox/trigger-va', [WalletController::class, 'triggerSandboxVa']);

        Route::post('/payments/qris/decode', [PaymentController::class, 'qrisDecode']);
        Route::post('/payments/qris/execute', [PaymentController::class, 'qrisExecute']);

        Route::get('/transfers/contacts', [PaymentController::class, 'transferContacts']);
        Route::get('/transfers/lookup', [PaymentController::class, 'transferLookup']);
        Route::post('/transfers/p2p', [PaymentController::class, 'p2pTransfer']);
        Route::post('/transfers/bank', [PaymentController::class, 'bankTransfer']);

        Route::post('/ppob/inquire', [PaymentController::class, 'ppobInquire']);
        Route::post('/ppob/execute', [PaymentController::class, 'ppobExecute']);

        Route::get('/split-bills', [SplitBillController::class, 'index']);
        Route::post('/split-bills', [SplitBillController::class, 'store']);
        Route::post('/split-bills/{id}/pay', [SplitBillController::class, 'pay']);

        Route::get('/transactions', [PaymentController::class, 'transactions']);
        Route::get('/transactions/export.csv', [PaymentController::class, 'exportCsv']);
        Route::get('/transactions/{id}', [PaymentController::class, 'transactionDetail']);
        Route::get('/analytics/summary', [PaymentController::class, 'analyticsSummary']);

        Route::get('/merchant', [MerchantAdminController::class, 'merchantDashboard']);
        Route::post('/merchant/qris', [MerchantAdminController::class, 'merchantQris']);
        Route::post('/merchant/settle', [MerchantAdminController::class, 'merchantSettle']);

        Route::get('/admin/overview', [MerchantAdminController::class, 'adminOverview']);
        Route::post('/admin/kyc/{id}/review', [MerchantAdminController::class, 'adminKycReview']);
        Route::post('/admin/transactions/{id}/reverse', [MerchantAdminController::class, 'adminReverseTx']);

        Route::post('/notifications/read', [MerchantAdminController::class, 'markNotificationsRead']);
    });
});
