@extends('layouts.app')

@section('content')
@php
    $firstName = explode(' ', trim($currentUser->full_name))[0] ?: $currentUser->full_name;
    $totalBal = (float) ($walletSummary['total_balance'] ?? 0);
    $mainBal = (float) ($walletSummary['main_balance'] ?? 0);
    $pocketsBal = (float) ($walletSummary['pockets_total'] ?? 0);
    $limitBal = (float) ($walletSummary['balance_limit'] ?? 2_000_000);
    $capPct = $limitBal > 0 ? min(100, (int) round(($totalBal / $limitBal) * 100)) : 0;
    $bifast = $walletSummary['bifast_quota'] ?? ['used_this_month' => 0, 'free_quota' => 10, 'remaining_free' => 10];
@endphp

<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-tight">
            Selamat datang, {{ $firstName }}
        </h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
            Ringkasan saldo, Kantong Pintar, dan transaksi terbaru Anda
        </p>
    </div>
    <div class="flex items-center gap-2">
        @if($currentUser->kyc_status === 'VERIFIED')
            <span class="sk-pill sk-pill-pos">SakuKilat Plus (Maks Rp 20 jt)</span>
        @else
            <a href="{{ route('profil') }}" class="sk-pill sk-pill-warn hover:opacity-90">
                Akun Basic (Maks Rp 2 jt) — Verifikasi e-KTP
            </a>
        @endif
    </div>
</div>

{{-- Primary Grid: Balance Card + Quick Services --}}
<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
    <section class="sk-card lg:col-span-7 flex flex-col justify-between" aria-label="Total saldo SakuKilat">
        <div>
            <div class="flex items-center justify-between gap-3">
                <span class="text-sm font-medium text-[var(--muted)]">Total Saldo SakuKilat</span>
                <button
                    type="button"
                    id="home-privacy-toggle"
                    class="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] px-2.5 py-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)]"
                    aria-pressed="false"
                    aria-label="Sembunyikan atau tampilkan nominal saldo"
                >
                    <x-icon name="eye" class="w-3.5 h-3.5" />
                    <span id="home-privacy-label">Sembunyikan</span>
                </button>
            </div>

            <p
                id="home-total-balance"
                class="mt-2 text-[32px] sm:text-[38px] font-semibold tracking-tight leading-[1.15] num"
                data-real="{{ \App\Support\Format::rupiah($totalBal) }}"
            >
                {{ \App\Support\Format::rupiah($totalBal) }}
            </p>

            <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
                <span>
                    Dompet Utama:
                    <strong class="font-semibold text-[var(--text)] num sk-hideable" data-real="{{ \App\Support\Format::rupiah($mainBal) }}">{{ \App\Support\Format::rupiah($mainBal) }}</strong>
                </span>
                <span>
                    Kantong Pintar:
                    <strong class="font-semibold text-[var(--text)] num sk-hideable" data-real="{{ \App\Support\Format::rupiah($pocketsBal) }}">{{ \App\Support\Format::rupiah($pocketsBal) }}</strong>
                </span>
            </div>

            <div class="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <a href="{{ route('topup') }}" class="sk-btn sk-btn-primary">
                    <x-icon name="plus" class="w-4 h-4" />
                    <span>Top Up</span>
                </a>
                <a href="{{ route('transfer') }}" class="sk-btn">
                    <x-icon name="transfer" class="w-4 h-4" />
                    <span>Transfer</span>
                </a>
                <a href="{{ route('pockets') }}" class="sk-btn">
                    <x-icon name="wallet" class="w-4 h-4" />
                    <span>Pindah</span>
                </a>
                <a href="{{ route('qris') }}" class="sk-btn">
                    <x-icon name="qris" class="w-4 h-4" />
                    <span>Bayar QRIS</span>
                </a>
            </div>
        </div>

        <div class="mt-4 pt-3 border-t border-[var(--rule)]">
            <div class="flex items-center justify-between text-xs text-[var(--muted)] mb-1.5">
                <span>Kapasitas Saldo Akun ({{ $capPct }}%)</span>
                <span class="num">Maks {{ \App\Support\Format::rupiah($limitBal) }}</span>
            </div>
            <div class="h-1.5 w-full rounded-full bg-[var(--ground)] overflow-hidden">
                <div class="h-full rounded-full bg-[var(--accent)]" style="width: {{ $capPct }}%"></div>
            </div>
        </div>
    </section>

    <section class="sk-card lg:col-span-5 flex flex-col justify-between" aria-label="Layanan cepat dan PPOB">
        <div>
            <div class="flex items-center justify-between gap-2 mb-3.5">
                <div>
                    <h2 class="text-[16px] font-semibold">Tagihan &amp; Layanan Cepat</h2>
                    <p class="text-xs text-[var(--muted)]">Pulsa, listrik, air, hingga patungan</p>
                </div>
                <a href="{{ route('ppob') }}" class="text-xs font-medium text-[var(--accent)] hover:underline shrink-0">
                    Semua Produk
                </a>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                @php
                    $tiles = [
                        ['label' => 'Pulsa', 'sub' => 'All Operator', 'icon' => 'phone', 'href' => route('ppob', ['cat' => 'PULSA'])],
                        ['label' => 'Paket Data', 'sub' => 'Internet', 'icon' => 'zap', 'href' => route('ppob', ['cat' => 'DATA'])],
                        ['label' => 'Token PLN', 'sub' => 'Listrik', 'icon' => 'zap', 'href' => route('ppob', ['cat' => 'PLN'])],
                        ['label' => 'PDAM', 'sub' => 'Air Bersih', 'icon' => 'droplet', 'href' => route('ppob', ['cat' => 'PDAM'])],
                        ['label' => 'BPJS', 'sub' => 'Kesehatan', 'icon' => 'heart', 'href' => route('ppob', ['cat' => 'BPJS'])],
                        ['label' => 'Patungan', 'sub' => 'Split Bill', 'icon' => 'users', 'href' => route('split-bill')],
                    ];
                @endphp
                @foreach($tiles as $tile)
                    <a
                        href="{{ $tile['href'] }}"
                        class="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] px-3 py-2.5 transition-colors flex flex-col justify-between gap-1.5 min-h-[64px]"
                    >
                        <x-icon :name="$tile['icon']" class="w-4 h-4 text-[var(--accent)]" />
                        <div>
                            <p class="text-[13px] font-semibold leading-tight text-[var(--text)]">{{ $tile['label'] }}</p>
                            <p class="text-[11px] text-[var(--faint)]">{{ $tile['sub'] }}</p>
                        </div>
                    </a>
                @endforeach
            </div>
        </div>

        <div class="mt-4 pt-3 border-t border-[var(--rule)] flex items-center justify-between text-xs text-[var(--muted)]">
            <span>Kuota BI-FAST Gratis Bulan Ini</span>
            <span class="font-semibold text-[var(--text)] num">{{ $bifast['remaining_free'] }} / {{ $bifast['free_quota'] }} tersisa</span>
        </div>
    </section>
</div>

{{-- Secondary Grid: Smart Pockets + Recent Transactions --}}
<div class="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
    <section class="sk-card lg:col-span-5 flex flex-col justify-between" aria-label="Ringkasan Kantong Pintar">
        <div>
            <div class="flex items-center justify-between gap-2 mb-3.5">
                <div>
                    <h2 class="text-[16px] font-semibold">Kantong Pintar</h2>
                    <p class="text-xs text-[var(--muted)]">Pisahkan anggaran makan, transport &amp; tabungan</p>
                </div>
                <a href="{{ route('pockets') }}" class="text-xs font-medium text-[var(--accent)] hover:underline shrink-0">
                    Kelola
                </a>
            </div>

            <div class="space-y-3">
                @forelse($walletSummary['pockets'] ?? [] as $pocket)
                    @php
                        $pc = \App\Support\Format::pocketColors($pocket->category_key);
                        $pBal = (float) $pocket->balance;
                        $pTarget = (float) ($pocket->target_amount ?? 0);
                        $pPct = $pTarget > 0 ? min(100, (int) round(($pBal / $pTarget) * 100)) : 0;
                    @endphp
                    <a href="{{ route('pockets') }}" class="block p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--ground)] hover:bg-[var(--raised)] transition-colors">
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2 min-w-0">
                                <p class="text-sm font-semibold truncate">{{ $pocket->name }}</p>
                                <span class="sk-pill" style="background: {{ $pc['bg'] }}; color: {{ $pc['ink'] }}">{{ $pc['label'] }}</span>
                            </div>
                            @if($pocket->is_locked)
                                <span class="sk-pill sk-pill-neutral">
                                    <x-icon name="lock" class="w-3 h-3" />
                                    Terkunci
                                </span>
                            @endif
                        </div>

                        <div class="mt-2 flex items-baseline justify-between gap-2">
                            <span class="text-base font-semibold num sk-hideable" data-real="{{ \App\Support\Format::rupiah($pBal) }}">
                                {{ \App\Support\Format::rupiah($pBal) }}
                            </span>
                            @if($pTarget > 0)
                                <span class="text-xs text-[var(--muted)] num">
                                    Target {{ \App\Support\Format::rupiah($pTarget) }} ({{ $pPct }}%)
                                </span>
                            @endif
                        </div>

                        @if($pTarget > 0)
                            <div class="mt-2 h-1.5 w-full rounded-full bg-[var(--surface)] overflow-hidden">
                                <div class="h-full rounded-full bg-[var(--accent)]" style="width: {{ $pPct }}%"></div>
                            </div>
                        @endif
                    </a>
                @empty
                    <div class="p-6 text-center rounded-[12px] border border-dashed border-[var(--control)]">
                        <p class="text-sm text-[var(--muted)]">Belum ada Kantong Pintar.</p>
                        <a href="{{ route('pockets') }}" class="mt-3 sk-btn sk-btn-primary">Buat Kantong Pertama</a>
                    </div>
                @endforelse
            </div>
        </div>

        <div class="mt-4 pt-3 border-t border-[var(--rule)] flex items-center justify-between text-xs text-[var(--muted)]">
            <span>Pindah saldo antar kantong</span>
            <span class="font-medium text-[var(--positive)]">Gratis Rp 0</span>
        </div>
    </section>

    <section class="sk-card lg:col-span-7 flex flex-col justify-between" aria-label="Transaksi terbaru">
        <div>
            <div class="flex items-center justify-between gap-2 mb-3.5">
                <div>
                    <h2 class="text-[16px] font-semibold">Transaksi Terbaru</h2>
                    <p class="text-xs text-[var(--muted)]">Klik transaksi untuk melihat Resi Digital &amp; Nomor Referensi</p>
                </div>
                <a href="{{ route('riwayat') }}" class="text-xs font-medium text-[var(--accent)] hover:underline shrink-0">
                    Lihat Riwayat
                </a>
            </div>

            <div class="divide-y divide-[var(--rule)]">
                @forelse($recentTransactions as $tx)
                    @php
                        $isIn = $tx['direction'] === 'IN';
                        $iconName = match ($tx['transaction_type']) {
                            'TOPUP' => 'plus',
                            'QRIS' => 'qris',
                            'PPOB' => 'zap',
                            'SPLIT_BILL' => 'users',
                            'SETTLEMENT' => 'store',
                            'REVERSAL' => 'history',
                            default => 'transfer',
                        };
                    @endphp
                    <button
                        type="button"
                        onclick='window.SakuKilat.openReceiptModal(@json($tx))'
                        class="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left hover:bg-[var(--raised)] -mx-2 px-2 rounded-[10px] transition-colors"
                    >
                        <div class="flex items-center gap-3 min-w-0">
                            <x-icon :name="$iconName" class="w-4 h-4 shrink-0 text-[var(--muted)]" />
                            <div class="min-w-0">
                                <p class="text-sm font-medium truncate text-[var(--text)]">{{ $tx['title'] }}</p>
                                <p class="text-xs text-[var(--faint)] truncate">
                                    {{ $tx['category'] }} • {{ \App\Support\Format::dateTimeWib($tx['created_at']) }} WIB
                                </p>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <p class="text-sm font-semibold num {{ $isIn ? 'text-[var(--positive)]' : 'text-[var(--text)]' }}">
                                {{ \App\Support\Format::signedRupiah((float) $tx['total_amount'], $tx['direction']) }}
                            </p>
                            <p class="text-[11px] font-mono-id text-[var(--faint)]">{{ $tx['status'] }}</p>
                        </div>
                    </button>
                @empty
                    <p class="py-10 text-center text-sm text-[var(--muted)]">Belum ada riwayat transaksi.</p>
                @endforelse
            </div>
        </div>

        <div class="mt-4 pt-3 border-t border-[var(--rule)] flex items-center justify-between text-xs text-[var(--muted)]">
            <span>Terakhir diperbarui</span>
            <span>{{ \App\Support\Format::dateTimeWib(now()->toIso8601String()) }} WIB</span>
        </div>
    </section>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('home-privacy-toggle');
  const totalEl = document.getElementById('home-total-balance');
  const labelEl = document.getElementById('home-privacy-label');
  if (!toggleBtn || !totalEl) return;

  let hidden = false;
  toggleBtn.addEventListener('click', () => {
    hidden = !hidden;
    toggleBtn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    labelEl.textContent = hidden ? 'Tampilkan' : 'Sembunyikan';
    totalEl.textContent = hidden ? 'Rp ••••••' : totalEl.dataset.real;
    document.querySelectorAll('.sk-hideable').forEach((el) => {
      el.textContent = hidden ? 'Rp ••••••' : el.dataset.real;
    });
  });
});
</script>
@endsection
