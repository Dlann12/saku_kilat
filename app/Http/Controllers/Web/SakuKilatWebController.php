<?php

declare(strict_types=1);

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\KycDocument;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\MerchantAdminService;
use App\Services\PaymentService;
use App\Services\QrisService;
use App\Services\SplitBillService;
use App\Services\WalletService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

final class SakuKilatWebController extends Controller
{
    public function __construct(
        private readonly WalletService $wallets,
        private readonly PaymentService $payments,
        private readonly QrisService $qris,
        private readonly SplitBillService $splitBills,
        private readonly MerchantAdminService $merchantAdmin,
    ) {}

    public function home(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();
        $walletSummary = $this->wallets->listUserWallets($user);
        $recentTransactions = $this->payments->listTransactions($user, ['limit' => 4]);

        return view('pages.home', [
            ...$this->shellData($user, 'Beranda'),
            'walletSummary' => $walletSummary,
            'recentTransactions' => $recentTransactions,
        ]);
    }

    public function auth(): View
    {
        $demoPersonas = User::query()
            ->where('role', '!=', 'SYSTEM')
            ->where('account_status', 'ACTIVE')
            ->orderBy('created_at')
            ->get(['id', 'phone_number', 'full_name', 'kyc_status', 'role']);

        return view('pages.auth', [
            'demoPersonas' => $demoPersonas,
        ]);
    }

    public function demoSwitch(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'uuid'],
        ]);

        $target = User::query()
            ->where('id', $data['user_id'])
            ->where('role', '!=', 'SYSTEM')
            ->firstOrFail();

        $request->session()->forget('sakukilat_logged_out');
        Auth::login($target);

        $redirect = $request->boolean('redirect_home')
            ? redirect()->route('home')
            : redirect()->back();

        return $redirect->with('status', "Berhasil beralih ke akun {$target->full_name}.");
    }

    public function webLogout(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        $request->session()->put('sakukilat_logged_out', true);

        return redirect()->route('auth');
    }

    public function topup(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();

        return view('pages.topup', [
            ...$this->shellData($user, 'Top Up Saldo'),
            'walletSummary' => $this->wallets->listUserWallets($user),
            'channels' => WalletService::TOPUP_CHANNELS,
        ]);
    }

    public function pockets(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();

        return view('pages.pockets', [
            ...$this->shellData($user, 'Kantong Pintar'),
            'walletSummary' => $this->wallets->listUserWallets($user),
        ]);
    }

    public function qris(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();
        $walletSummary = $this->wallets->listUserWallets($user);

        $presets = [
            [
                'id' => 'kenangan',
                'label' => 'Kopi Kenangan Bengkulu (Statis)',
                'badge' => 'QRIS Statis',
                'payload' => $p1 = $this->qris->buildQrisPayload('ID1026177100022', 'Kopi Kenangan Bengkulu', 'Kota Bengkulu', null, false),
                'svg' => $this->qris->renderSvg($p1, 140),
            ],
            [
                'id' => 'warung-budi',
                'label' => 'Warung Kopi Pak Budi (Dinamis Rp 38.000)',
                'badge' => 'Rp 38.000',
                'payload' => $p2 = $this->qris->buildQrisPayload('ID1026177100011', 'Warung Kopi Pak Budi', 'Kota Bengkulu', 38_000, true),
                'svg' => $this->qris->renderSvg($p2, 140),
            ],
            [
                'id' => 'tj',
                'label' => 'TransJakarta Harmoni (Dinamis Rp 3.500)',
                'badge' => 'Rp 3.500',
                'payload' => $p3 = $this->qris->buildQrisPayload('ID1026317100033', 'TransJakarta Harmoni', 'Jakarta Pusat', 3_500, true),
                'svg' => $this->qris->renderSvg($p3, 140),
            ],
        ];

        $usableWallets = $walletSummary['wallets']
            ->filter(fn ($w): bool => in_array($w->wallet_type, ['MAIN', 'POCKET'], true))
            ->values();

        return view('pages.qris', [
            ...$this->shellData($user, 'Scan & Bayar QRIS'),
            'usableWallets' => $usableWallets,
            'presets' => $presets,
        ]);
    }

    public function transfer(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();
        $walletSummary = $this->wallets->listUserWallets($user);
        $usableWallets = $walletSummary['wallets']
            ->filter(fn ($w): bool => in_array($w->wallet_type, ['MAIN', 'POCKET'], true))
            ->values();

        $quickContacts = User::query()
            ->where('role', '!=', 'SYSTEM')
            ->where('id', '!=', $user->id)
            ->orderBy('created_at')
            ->limit(4)
            ->get(['full_name', 'phone_number']);

        return view('pages.transfer', [
            ...$this->shellData($user, 'Transfer Dana'),
            'walletSummary' => $walletSummary,
            'usableWallets' => $usableWallets,
            'quickContacts' => $quickContacts,
            'prefillPhone' => (string) $request->query('phone', '+6281234567890'),
        ]);
    }

    public function ppob(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();
        $walletSummary = $this->wallets->listUserWallets($user);
        $usableWallets = $walletSummary['wallets']
            ->filter(fn ($w): bool => in_array($w->wallet_type, ['MAIN', 'POCKET'], true))
            ->values();

        return view('pages.ppob', [
            ...$this->shellData($user, 'Bayar & Beli PPOB'),
            'products' => PaymentService::PPOB_CATALOG,
            'usableWallets' => $usableWallets,
            'initialCategory' => (string) $request->query('cat', 'ALL'),
        ]);
    }

    public function splitBill(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();
        $walletSummary = $this->wallets->listUserWallets($user);
        $usableWallets = $walletSummary['wallets']
            ->filter(fn ($w): bool => in_array($w->wallet_type, ['MAIN', 'POCKET'], true))
            ->values();

        $peers = User::query()
            ->where('role', '!=', 'SYSTEM')
            ->where('id', '!=', $user->id)
            ->orderBy('created_at')
            ->get(['id', 'full_name', 'phone_number']);

        return view('pages.split-bill', [
            ...$this->shellData($user, 'Patungan (Split Bill)'),
            'bills' => $this->splitBills->listForUser($user),
            'usableWallets' => $usableWallets,
            'peers' => $peers,
        ]);
    }

    public function riwayat(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();
        $filters = [
            'direction' => (string) $request->query('direction', 'ALL'),
            'type' => (string) $request->query('type', 'ALL'),
            'q' => (string) $request->query('q', ''),
            'limit' => 50,
        ];

        return view('pages.riwayat', [
            ...$this->shellData($user, 'Riwayat & Laporan'),
            'transactions' => $this->payments->listTransactions($user, $filters),
            'analytics' => $this->payments->getAnalyticsSummary($user),
            'filters' => $filters,
        ]);
    }

    public function exportCsv(Request $request): HttpResponse
    {
        /** @var User $user */
        $user = $request->user();
        $rows = $this->payments->listTransactions($user, [
            'direction' => (string) $request->query('direction', 'ALL'),
            'type' => (string) $request->query('type', 'ALL'),
            'q' => (string) $request->query('q', ''),
            'limit' => 100,
        ]);

        $lines = ['Referensi,Waktu,Judul,Kategori,Jenis,Status,Arah,Nominal,Admin,Total'];
        foreach ($rows as $r) {
            $title = str_replace('"', '""', $r['title']);
            $lines[] = implode(',', [
                $r['reference_number'],
                $r['created_at'],
                "\"{$title}\"",
                "\"{$r['category']}\"",
                $r['transaction_type'],
                $r['status'],
                $r['direction'],
                $r['amount'],
                $r['admin_fee'],
                $r['total_amount'],
            ]);
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="mutasi-sakukilat-'.now()->format('Y-m-d').'.csv"',
        ]);
    }

    public function profil(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();
        $latestKyc = KycDocument::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->first();

        return view('pages.profil', [
            ...$this->shellData($user, 'Profil & KYC'),
            'latestKyc' => $latestKyc,
            'profileQrSvg' => $this->qris->renderSvg("SAKUKILAT:USER:{$user->phone_number}", 156),
        ]);
    }

    public function merchant(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();

        return view('pages.merchant', [
            ...$this->shellData($user, 'SakuKilat Bisnis'),
            'dashboard' => $this->merchantAdmin->getMerchantDashboard($user),
        ]);
    }

    public function admin(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();

        return view('pages.admin', [
            ...$this->shellData($user, 'Admin & Ledger'),
            'overview' => $this->merchantAdmin->getAdminOverview(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function shellData(User $user, string $pageTitle): array
    {
        $demoPersonas = User::query()
            ->where('role', '!=', 'SYSTEM')
            ->where('account_status', 'ACTIVE')
            ->orderBy('created_at')
            ->get(['id', 'phone_number', 'full_name', 'kyc_status', 'role']);

        $notifications = UserNotification::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return [
            'pageTitle' => $pageTitle,
            'currentUser' => $user,
            'demoPersonas' => $demoPersonas,
            'notifications' => $notifications,
            'unreadCount' => $notifications->where('is_read', false)->count(),
        ];
    }
}
