<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="theme-color" content="#F3F5F7">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600&display=swap" rel="stylesheet">
    <title>{{ isset($pageTitle) ? "{$pageTitle} — SakuKilat" : 'SakuKilat — Transaksi Cepat, Kelola Uang Tanpa Ribet' }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
@php
    $routeName = request()->route()?->getName();
    $navPrimary = [
        ['route' => 'home', 'label' => 'Beranda', 'icon' => 'home'],
        ['route' => 'riwayat', 'label' => 'Riwayat', 'icon' => 'history'],
        ['route' => 'qris', 'label' => 'Scan & Bayar QRIS', 'icon' => 'qris'],
        ['route' => 'pockets', 'label' => 'Kantong Pintar', 'icon' => 'wallet'],
        ['route' => 'transfer', 'label' => 'Transfer Dana', 'icon' => 'transfer'],
        ['route' => 'ppob', 'label' => 'Bayar & Beli PPOB', 'icon' => 'zap'],
    ];
    $navSecondary = [
        ['route' => 'split-bill', 'label' => 'Patungan (Split Bill)', 'icon' => 'users'],
        ['route' => 'merchant', 'label' => 'SakuKilat Bisnis', 'icon' => 'store'],
        ['route' => 'admin', 'label' => 'Admin & Ledger', 'icon' => 'shield'],
    ];
@endphp

<div class="sk-shell">
    {{-- Desktop Open-Plane Sidebar --}}
    <aside class="sk-sidebar" aria-label="Navigasi utama">
        <div class="flex items-center gap-2.5 px-2 pb-4">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect width="32" height="32" rx="9" fill="#1D5FD6" />
                <path d="M17.5 6.5L10 17.5H16L14.5 25.5L22 14.5H16L17.5 6.5Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1" stroke-linejoin="round" />
            </svg>
            <div>
                <p class="text-[15px] font-semibold tracking-tight leading-tight">SakuKilat</p>
                <p class="text-[11px] text-[var(--faint)]">Dompet Digital</p>
            </div>
        </div>

        @if(isset($demoPersonas) && $demoPersonas->isNotEmpty())
            <form method="POST" action="{{ route('demo.switch') }}" class="mb-4 px-1">
                @csrf
                <label for="desktop-persona-select" class="block text-[11px] font-medium text-[var(--faint)] mb-1 px-1">
                    Akun Aktif (Demo Persona)
                </label>
                <select
                    id="desktop-persona-select"
                    name="user_id"
                    onchange="this.form.submit()"
                    class="w-full h-9 px-2.5 text-[13px] font-medium bg-[var(--surface)] border border-[var(--border)] rounded-[9px] cursor-pointer"
                >
                    @foreach($demoPersonas as $p)
                        <option value="{{ $p->id }}" @selected(isset($currentUser) && $currentUser->id === $p->id)>
                            {{ $p->full_name }} ({{ $p->kyc_status === 'VERIFIED' ? 'KYC' : 'Basic' }})
                        </option>
                    @endforeach
                </select>
            </form>
        @endif

        <nav class="space-y-0.5">
            @foreach($navPrimary as $item)
                @php $active = $routeName === $item['route']; @endphp
                <a
                    href="{{ route($item['route']) }}"
                    @if($active) aria-current="page" @endif
                    class="flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] transition-colors {{ $active ? 'bg-[var(--active)] text-[var(--text)] font-medium' : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]' }}"
                >
                    <x-icon :name="$item['icon']" class="w-4 h-4 shrink-0" />
                    <span class="truncate">{{ $item['label'] }}</span>
                </a>
            @endforeach

            <p class="mt-5 mb-1.5 px-2.5 text-[12px] text-[var(--faint)]">Layanan &amp; Pengawasan</p>

            @foreach($navSecondary as $item)
                @php $active = $routeName === $item['route']; @endphp
                <a
                    href="{{ route($item['route']) }}"
                    @if($active) aria-current="page" @endif
                    class="flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] transition-colors {{ $active ? 'bg-[var(--active)] text-[var(--text)] font-medium' : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]' }}"
                >
                    <x-icon :name="$item['icon']" class="w-4 h-4 shrink-0" />
                    <span class="truncate">{{ $item['label'] }}</span>
                </a>
            @endforeach
        </nav>

        <div class="mt-auto pt-4 border-t border-[var(--border)] space-y-1">
            <button
                type="button"
                onclick="document.getElementById('sk-notif-modal').classList.remove('hidden')"
                class="w-full flex items-center justify-between h-9 px-2.5 rounded-[8px] text-[14px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
            >
                <span class="flex items-center gap-2.5">
                    <x-icon name="bell" class="w-4 h-4" />
                    Notifikasi
                </span>
                @if(($unreadCount ?? 0) > 0)
                    <span class="px-1.5 py-0.5 text-[11px] font-semibold rounded-full bg-[var(--accent)] text-white num">{{ $unreadCount }}</span>
                @endif
            </button>
            <a
                href="{{ route('profil') }}"
                @if($routeName === 'profil') aria-current="page" @endif
                class="flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] transition-colors {{ $routeName === 'profil' ? 'bg-[var(--active)] text-[var(--text)] font-medium' : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]' }}"
            >
                <x-icon name="user" class="w-4 h-4 shrink-0" />
                <span class="truncate">Profil &amp; KYC</span>
            </a>
            <a
                href="{{ route('auth') }}"
                class="flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
            >
                <x-icon name="login" class="w-4 h-4 shrink-0" />
                <span>Daftar / Login OTP</span>
            </a>
        </div>
    </aside>

    {{-- Main Content Column --}}
    <div class="min-w-0">
        {{-- Mobile Header --}}
        <header class="sk-mobile-header">
            <div class="flex items-center gap-2.5">
                <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <rect width="32" height="32" rx="9" fill="#1D5FD6" />
                    <path d="M17.5 6.5L10 17.5H16L14.5 25.5L22 14.5H16L17.5 6.5Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1" stroke-linejoin="round" />
                </svg>
                <span class="font-semibold text-[15px]">{{ $pageTitle ?? 'SakuKilat' }}</span>
            </div>
            <div class="flex items-center gap-1">
                <button
                    type="button"
                    onclick="document.getElementById('sk-notif-modal').classList.remove('hidden')"
                    class="relative w-11 h-11 flex items-center justify-center rounded-[10px] text-[var(--text)]"
                    aria-label="Buka notifikasi"
                >
                    <x-icon name="bell" class="w-5 h-5" />
                    @if(($unreadCount ?? 0) > 0)
                        <span class="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[var(--accent)]"></span>
                    @endif
                </button>
                <button
                    type="button"
                    onclick="document.getElementById('sk-mobile-drawer').classList.remove('hidden')"
                    class="w-11 h-11 flex items-center justify-center rounded-[10px] text-[var(--text)]"
                    aria-label="Buka menu layanan"
                >
                    <x-icon name="menu" class="w-5 h-5" />
                </button>
            </div>
        </header>

        <main class="sk-canvas">
            <div class="sk-container">
                @if(session('status'))
                    <div class="mb-4 p-3 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm">
                        {{ session('status') }}
                    </div>
                @endif
                @yield('content')
            </div>
        </main>
    </div>

    {{-- One-Thumb Reachability Bottom Nav (Mobile <= 860px) --}}
    <nav class="sk-bottom-nav" aria-label="Navigasi bawah mobile">
        <a href="{{ route('home') }}" class="flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium {{ $routeName === 'home' ? 'text-[var(--accent)]' : 'text-[var(--muted)]' }}">
            <x-icon name="home" class="w-5 h-5" />
            <span>Beranda</span>
        </a>
        <a href="{{ route('riwayat') }}" class="flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium {{ $routeName === 'riwayat' ? 'text-[var(--accent)]' : 'text-[var(--muted)]' }}">
            <x-icon name="history" class="w-5 h-5" />
            <span>Riwayat</span>
        </a>
        <a href="{{ route('qris') }}" class="flex flex-col items-center justify-end pb-0.5" aria-label="Scan & Bayar QRIS">
            <span class="w-12 h-12 -mt-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center border-4 border-[var(--surface)]">
                <x-icon name="qris" class="w-5 h-5" />
            </span>
            <span class="text-[11px] font-semibold text-[var(--accent)] mt-0.5">QRIS</span>
        </a>
        <a href="{{ route('pockets') }}" class="flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium {{ $routeName === 'pockets' ? 'text-[var(--accent)]' : 'text-[var(--muted)]' }}">
            <x-icon name="wallet" class="w-5 h-5" />
            <span>Kantong</span>
        </a>
        <a href="{{ route('profil') }}" class="flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium {{ $routeName === 'profil' ? 'text-[var(--accent)]' : 'text-[var(--muted)]' }}">
            <x-icon name="user" class="w-5 h-5" />
            <span>Profil</span>
        </a>
    </nav>
</div>

{{-- Mobile Drawer --}}
<div id="sk-mobile-drawer" class="hidden fixed inset-0 z-50 bg-black/35 flex justify-end">
    <div class="w-full max-w-[320px] h-full bg-[var(--surface)] p-5 overflow-y-auto">
        <div class="flex items-center justify-between pb-4 border-b border-[var(--border)]">
            <span class="font-semibold">Menu SakuKilat</span>
            <button type="button" onclick="document.getElementById('sk-mobile-drawer').classList.add('hidden')" class="w-10 h-10 rounded-[8px] flex items-center justify-center text-[var(--muted)]">
                ✕
            </button>
        </div>
        @if(isset($demoPersonas) && $demoPersonas->isNotEmpty())
            <form method="POST" action="{{ route('demo.switch') }}" class="mt-4">
                @csrf
                <label for="mobile-persona-select" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Ganti Akun Demo</label>
                <select id="mobile-persona-select" name="user_id" onchange="this.form.submit()" class="sk-input text-sm">
                    @foreach($demoPersonas as $p)
                        <option value="{{ $p->id }}" @selected(isset($currentUser) && $currentUser->id === $p->id)>
                            {{ $p->full_name }} ({{ $p->kyc_status }})
                        </option>
                    @endforeach
                </select>
            </form>
        @endif
        <div class="mt-5 space-y-1">
            @foreach([...$navPrimary, ...$navSecondary, ['route' => 'topup', 'label' => 'Top Up Saldo', 'icon' => 'plus'], ['route' => 'profil', 'label' => 'Profil & KYC', 'icon' => 'user'], ['route' => 'auth', 'label' => 'Daftar / Login OTP', 'icon' => 'login']] as $item)
                <a href="{{ route($item['route']) }}" class="flex items-center gap-3 min-h-[44px] px-3 rounded-[10px] text-sm {{ $routeName === $item['route'] ? 'bg-[var(--active)] font-medium text-[var(--text)]' : 'text-[var(--muted)]' }}">
                    <x-icon :name="$item['icon']" class="w-4 h-4" />
                    <span>{{ $item['label'] }}</span>
                </a>
            @endforeach
        </div>
    </div>
</div>

{{-- Notifications Sheet --}}
<div id="sk-notif-modal" class="hidden fixed inset-0 z-50 bg-black/35 flex items-end sm:items-center justify-center p-0 sm:p-4">
    <div class="w-full sm:max-w-[460px] max-h-[80vh] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-t-[20px] sm:rounded-[20px] p-5" style="box-shadow: 0 12px 32px rgba(27,29,31,0.14)">
        <div class="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div>
                <h2 class="text-[17px] font-semibold">Pusat Notifikasi</h2>
                <p class="text-xs text-[var(--muted)]">Alert transaksi, KYC, patungan &amp; OTP sandbox</p>
            </div>
            <div class="flex items-center gap-2">
                @if(($unreadCount ?? 0) > 0)
                    <button type="button" onclick="window.SakuKilat.api('/api/v1/notifications/read', { method: 'POST' }).then(() => location.reload())" class="text-xs font-medium text-[var(--accent)] px-2 py-1 rounded-[6px] hover:bg-[var(--raised)]">Tandai terbaca</button>
                @endif
                <button type="button" onclick="document.getElementById('sk-notif-modal').classList.add('hidden')" class="w-9 h-9 rounded-[8px] text-[var(--muted)] hover:bg-[var(--raised)]">✕</button>
            </div>
        </div>
        <div class="mt-3 overflow-y-auto divide-y divide-[var(--rule)]">
            @forelse($notifications ?? [] as $n)
                <div class="py-3">
                    <div class="flex items-center justify-between gap-2">
                        <p class="text-sm font-medium">{{ $n->title }}</p>
                        <span class="sk-pill sk-pill-neutral">{{ $n->channel }}</span>
                    </div>
                    <p class="mt-1 text-xs text-[var(--muted)] leading-relaxed">{{ $n->body }}</p>
                </div>
            @empty
                <p class="py-8 text-center text-sm text-[var(--muted)]">Belum ada notifikasi baru.</p>
            @endforelse
        </div>
    </div>
</div>

{{-- Global 6-Digit PIN Modal --}}
<div id="sk-pin-modal" class="hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="sk-pin-title">
    <div class="w-full sm:max-w-[400px] bg-[var(--surface)] border border-[var(--border)] rounded-t-[20px] sm:rounded-[20px] p-6" style="box-shadow: 0 12px 32px rgba(27,29,31,0.14)">
        <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-ink)] flex items-center justify-center">
                    <x-icon name="lock" class="w-4 h-4" />
                </div>
                <div>
                    <h2 id="sk-pin-title" class="text-[17px] font-semibold">Konfirmasi PIN SakuKilat</h2>
                    <p id="sk-pin-amount" class="text-sm font-semibold text-[var(--accent)] num"></p>
                </div>
            </div>
            <button type="button" id="sk-pin-close" class="w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--muted)] hover:bg-[var(--raised)]" aria-label="Tutup dialog PIN">✕</button>
        </div>

        <p class="mt-3 text-sm text-[var(--muted)]">Masukkan 6-digit PIN untuk otorisasi transaksi (berlaku 60 detik).</p>

        <div id="sk-pin-dots" class="mt-5 flex items-center justify-center gap-3">
            @for($i = 0; $i < 6; $i++)
                <span class="w-3.5 h-3.5 rounded-full border border-[var(--control)] transition-colors"></span>
            @endfor
        </div>

        <div class="mt-3">
            <label for="pin-keyboard-input" class="sr-only">Masukkan 6 digit PIN</label>
            <input id="pin-keyboard-input" type="password" inputmode="numeric" maxlength="6" placeholder="Atau ketik 6 digit PIN (demo: 123456)" class="sk-input text-center text-sm tracking-widest num">
        </div>

        <p id="sk-pin-error" class="mt-3 text-xs font-medium text-[var(--negative)] text-center"></p>

        <div class="mt-4 grid grid-cols-3 gap-2.5">
            @foreach(['1','2','3','4','5','6','7','8','9'] as $d)
                <button type="button" data-pin-digit="{{ $d }}" class="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] text-lg font-semibold num">{{ $d }}</button>
            @endforeach
            @if(isset($currentUser) && $currentUser->biometric_enabled)
                <button type="button" id="sk-pin-bio" class="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent-ink)] text-xs font-medium">Biometrik</button>
            @else
                <div></div>
            @endif
            <button type="button" data-pin-digit="0" class="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] text-lg font-semibold num">0</button>
            <button type="button" id="sk-pin-backspace" class="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] text-sm text-[var(--muted)]" aria-label="Hapus digit PIN">Hapus</button>
        </div>

        <p id="sk-pin-status" class="hidden mt-3 text-xs text-center text-[var(--muted)]">Memverifikasi &amp; mengeksekusi transaksi atomik...</p>
    </div>
</div>

{{-- Global Digital Receipt Modal --}}
<div id="sk-receipt-modal" class="hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="sk-rcpt-heading">
    <div class="w-full sm:max-w-[440px] bg-[var(--surface)] border border-[var(--border)] rounded-t-[20px] sm:rounded-[20px] p-6" style="box-shadow: 0 12px 32px rgba(27,29,31,0.14)">
        <div class="flex items-start justify-between gap-3">
            <div>
                <h2 id="sk-rcpt-heading" class="text-[17px] font-semibold">Transaksi Berhasil</h2>
                <p id="sk-rcpt-time" class="text-xs text-[var(--muted)]"></p>
            </div>
            <button type="button" id="sk-rcpt-close" class="w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--muted)] hover:bg-[var(--raised)]" aria-label="Tutup resi">✕</button>
        </div>

        <div class="mt-5 p-4 rounded-[12px] bg-[var(--ground)] border border-[var(--border)]">
            <p id="sk-rcpt-cat" class="text-xs text-[var(--muted)]"></p>
            <p id="sk-rcpt-title" class="text-base font-semibold mt-0.5"></p>
            <p id="sk-rcpt-total-big" class="text-2xl font-semibold num mt-2"></p>
        </div>

        <div id="sk-rcpt-token-box" class="hidden mt-3 p-3.5 rounded-[10px] bg-[var(--accent-soft)] border border-[#bfe1ff]">
            <p class="text-xs font-medium text-[var(--accent-ink)]">Nomor Token / Voucher Digital</p>
            <p id="sk-rcpt-token" class="mt-1 text-base font-semibold text-[var(--accent-ink)] font-mono-id tracking-wider"></p>
        </div>

        <dl class="mt-4 space-y-2.5 text-sm">
            <div class="flex justify-between gap-4">
                <dt class="text-[var(--muted)]">Nomor Referensi</dt>
                <dd id="sk-rcpt-ref" class="font-mono-id text-xs font-medium"></dd>
            </div>
            <div class="flex justify-between gap-4">
                <dt class="text-[var(--muted)]">Status</dt>
                <dd><span id="sk-rcpt-status" class="sk-pill sk-pill-pos">SUCCESS</span></dd>
            </div>
            <div id="sk-rcpt-src-row" class="hidden flex justify-between gap-4">
                <dt class="text-[var(--muted)]">Sumber Dana</dt>
                <dd id="sk-rcpt-src" class="font-medium"></dd>
            </div>
            <div class="flex justify-between gap-4">
                <dt class="text-[var(--muted)]">Nominal Transaksi</dt>
                <dd id="sk-rcpt-amount" class="num font-medium"></dd>
            </div>
            <div class="flex justify-between gap-4">
                <dt class="text-[var(--muted)]">Biaya Admin</dt>
                <dd id="sk-rcpt-fee" class="num font-medium"></dd>
            </div>
            <div class="pt-2.5 border-t border-[var(--rule)] flex justify-between gap-4 font-semibold">
                <dt>Total Dibayarkan</dt>
                <dd id="sk-rcpt-total" class="num text-[var(--accent)]"></dd>
            </div>
        </dl>

        <div class="mt-5 grid grid-cols-2 gap-3">
            <button type="button" id="sk-rcpt-copy" class="sk-btn">Salin Resi</button>
            <button type="button" id="sk-rcpt-download" class="sk-btn sk-btn-primary">Unduh Resi</button>
        </div>
    </div>
</div>
</body>
</html>
