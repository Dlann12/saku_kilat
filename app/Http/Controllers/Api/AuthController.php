<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KycDocument;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\AppConfigService;
use App\Services\AuthService;
use App\Services\QrisService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;

final class AuthController extends Controller
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly QrisService $qris,
        private readonly AppConfigService $appConfig,
    ) {}

    public function otpRequest(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone_number' => ['required', 'string', 'min:9', 'max:20'],
            'channel' => ['sometimes', 'in:WHATSAPP,SMS'],
        ]);

        return response()->json([
            'data' => $this->auth->requestOtp($data['phone_number'], $data['channel'] ?? 'WHATSAPP'),
        ]);
    }

    public function otpVerify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone_number' => ['required', 'string', 'min:9', 'max:20'],
            'otp_code' => ['required', 'regex:/^\d{6}$/'],
            'purpose' => ['sometimes', 'in:REGISTER,LOGIN'],
        ]);

        $res = $this->auth->verifyOtp(
            $data['phone_number'],
            $data['otp_code'],
            $data['purpose'] ?? 'REGISTER',
            $request->header('X-Device-Id')
        );

        if (($res['mode'] ?? null) === 'LOGIN' && $res['user'] instanceof User) {
            $res['token'] = $this->establishWebSession($request, $res['user']);
        }

        return response()->json(['data' => $res]);
    }

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone_number' => ['required', 'string', 'min:9', 'max:20'],
            'full_name' => ['required', 'string', 'min:2', 'max:100'],
            'email' => ['nullable', 'email', 'max:160'],
            'pin' => ['required', 'regex:/^\d{6}$/'],
            'registration_token' => ['required', 'string', 'min:10'],
            'device_id' => ['nullable', 'string', 'max:120'],
        ]);

        $user = $this->auth->registerWithPin(
            $data,
            $data['device_id'] ?? $request->header('X-Device-Id')
        );

        $token = $this->establishWebSession($request, $user);

        return response()->json([
            'data' => ['user' => $user, 'token' => $token, 'csrf_token' => csrf_token()],
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required_without:phone_number', 'nullable', 'string', 'min:4', 'max:160'],
            'phone_number' => ['required_without:identifier', 'nullable', 'string', 'min:9', 'max:20'],
            'pin' => ['required', 'regex:/^\d{6}$/'],
            'device_id' => ['nullable', 'string', 'max:120'],
        ]);

        $res = $this->auth->loginWithPin(
            (string) ($data['identifier'] ?? $data['phone_number']),
            $data['pin'],
            $data['device_id'] ?? $request->header('X-Device-Id')
        );

        /** @var User $user */
        $user = $res['user'];
        $token = $this->establishWebSession($request, $user);

        return response()->json([
            'data' => [
                'user' => $user,
                'device_changed' => $res['device_changed'],
                'token' => $token,
                'csrf_token' => csrf_token(),
            ],
        ]);
    }

    public function session(Request $request): JsonResponse
    {
        $loggedOut = $request->hasSession() && (bool) $request->session()->get('sakukilat_logged_out', false);
        $user = Auth::guard('web')->user();

        if (! $user && ! $loggedOut) {
            $demo = User::query()->find(DatabaseSeeder::IDS['dlan'])
                ?? User::query()->where('role', '!=', 'SYSTEM')->where('account_status', 'ACTIVE')->first();

            if ($demo) {
                Auth::guard('web')->login($demo);
                $user = $demo;
            }
        }

        $demoPersonas = User::query()
            ->where('role', '!=', 'SYSTEM')
            ->where('account_status', 'ACTIVE')
            ->orderBy('created_at')
            ->get(['id', 'phone_number', 'email', 'full_name', 'kyc_status', 'role']);

        $notifications = $user
            ? UserNotification::query()->where('user_id', $user->id)->orderByDesc('created_at')->limit(20)->get()
            : collect();

        return response()->json([
            'data' => [
                'authenticated' => $user !== null,
                'user' => $user,
                'balance_limit' => $user?->balanceLimit(),
                'demo_personas' => $demoPersonas,
                'notifications' => $notifications,
                'unread_count' => $notifications->where('is_read', false)->count(),
                'app_config' => $this->appConfig->get(),
                'csrf_token' => csrf_token(),
            ],
        ]);
    }

    public function demoSwitch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'uuid'],
        ]);

        $target = User::query()
            ->where('id', $data['user_id'])
            ->where('role', '!=', 'SYSTEM')
            ->where('account_status', 'ACTIVE')
            ->firstOrFail();

        $this->establishWebSession($request, $target);

        return response()->json([
            'data' => [
                'user' => $target,
                'balance_limit' => $target->balanceLimit(),
                'csrf_token' => csrf_token(),
            ],
        ]);
    }

    private function establishWebSession(Request $request, User $user): string
    {
        Auth::guard('web')->login($user);
        Auth::guard('sanctum')->forgetUser();
        Auth::forgetGuards();
        if ($request->hasSession()) {
            $request->session()->forget('sakukilat_logged_out');
        }

        return $user->createToken('api')->plainTextToken;
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && $user->currentAccessToken() instanceof PersonalAccessToken) {
            $user->currentAccessToken()->delete();
        }
        Auth::guard('web')->logout();
        Auth::guard('sanctum')->forgetUser();
        Auth::forgetGuards();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            $request->session()->put('sakukilat_logged_out', true);
        }

        return response()->json(['data' => ['logged_out' => true, 'csrf_token' => csrf_token()]]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $latestKyc = KycDocument::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->first(['id', 'full_name_ktp', 'status', 'rejection_reason', 'verified_at', 'created_at']);

        $notifications = UserNotification::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json([
            'data' => [
                'user' => $user,
                'balance_limit' => $user->balanceLimit(),
                'latest_kyc' => $latestKyc,
                'notifications' => $notifications,
                'profile_qr_svg' => $this->qris->renderSvg("SAKUKILAT:USER:{$user->phone_number}", 180),
            ],
        ]);
    }

    public function pinVerify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pin' => ['required', 'regex:/^\d{6}$/'],
        ]);

        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->auth->verifyPinForTx($user, $data['pin']),
        ]);
    }

    public function biometric(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:toggle,authorize'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        /** @var User $user */
        $user = $request->user();

        if ($data['action'] === 'toggle') {
            $user->update(['biometric_enabled' => (bool) ($data['enabled'] ?? false)]);

            return response()->json(['data' => ['biometric_enabled' => $user->biometric_enabled]]);
        }

        return response()->json(['data' => $this->auth->authorizeBiometricTx($user)]);
    }

    public function kycShow(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $latest = KycDocument::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->first(['id', 'full_name_ktp', 'status', 'rejection_reason', 'verified_at', 'created_at']);

        return response()->json([
            'data' => [
                'kyc_status' => $user->kyc_status,
                'balance_limit' => $user->balanceLimit(),
                'latest_document' => $latest,
            ],
        ]);
    }

    public function kycSubmit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nik' => ['required', 'regex:/^\d{16}$/'],
            'full_name_ktp' => ['required', 'string', 'min:3', 'max:120'],
            'ktp_image_url' => ['required', 'string', 'min:5'],
            'selfie_image_url' => ['required', 'string', 'min:5'],
            'liveness_passed' => ['required', 'accepted'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $doc = $this->auth->submitKyc($user, $data);

        return response()->json(['data' => $doc], 201);
    }
}
