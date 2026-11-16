@extends('layouts.app')

@section('content')
@php
    $series = $analytics['daily_series'] ?? [];
    $maxOut = max(10000, ...array_map(fn ($d) => (float) $d['out_amount'], $series));
    $maxIn = max(10000, ...array_map(fn ($d) => (float) $d['in_amount'], $series));
@endphp

<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Riwayat &amp; Laporan Keuangan</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">Arus kas 7 hari terakhir, komposisi pengeluaran, dan unduhan mutasi CSV</p>
    </div>
    <div class="flex items-center gap-2">
        <a href="{{ route('riwayat.csv', request()->query()) }}" class="sk-btn">Unduh CSV</a>
        <a href="{{ route('home') }}" class="sk-btn">Beranda</a>
    </div>
</div>

{{-- Monthly Cashflow KPIs --}}
<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
    <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Total Pemasukan</p>
        <p class="mt-1 text-2xl font-semibold num text-[var(--positive)]">+{{ \App\Support\Format::rupiah((float) ($analytics['total_in'] ?? 0)) }}</p>
    </div>
    <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Total Pengeluaran</p>
        <p class="mt-1 text-2xl font-semibold num">{{ \App\Support\Format::rupiah((float) ($analytics['total_out'] ?? 0)) }}</p>
    </div>
    <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Selisih Bersih ({{ $analytics['transaction_count'] ?? 0 }} transaksi)</p>
        @php $net = (float) ($analytics['net_flow'] ?? 0); @endphp
        <p class="mt-1 text-2xl font-semibold num {{ $net >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]' }}">
            {{ $net >= 0 ? '+' : '-' }}{{ \App\Support\Format::rupiah(abs($net)) }}
        </p>
    </div>
</div>

{{-- Analytics Row: 7-Day Bar Chart + Category Breakdown --}}
<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start mb-5">
    <section class="sk-card lg:col-span-7 flex flex-col justify-between">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
                <h2 class="text-[16px] font-semibold">Tren Arus Kas 7 Hari</h2>
                <p class="text-xs text-[var(--muted)]">Ringkasan harian transaksi berstatus SUCCESS</p>
            </div>
            <div class="flex gap-1.5 p-1 rounded-[10px] bg-[var(--ground)] border border-[var(--border)]">
                <button type="button" id="chart-mode-out" class="px-2.5 h-7 rounded-[7px] text-xs font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]">Pengeluaran</button>
                <button type="button" id="chart-mode-in" class="px-2.5 h-7 rounded-[7px] text-xs font-medium text-[var(--muted)]">Pemasukan</button>
            </div>
        </div>

        <div class="w-full overflow-hidden">
            <svg id="cashflow-svg" viewBox="0 0 640 210" class="w-full h-auto block" role="img" aria-label="Grafik arus kas 7 hari terakhir">
                @for($g = 0; $g <= 3; $g++)
                    @php $y = 20 + ($g * 50); @endphp
                    <line x1="78" y1="{{ $y }}" x2="624" y2="{{ $y }}" stroke="#F0F1F3" stroke-width="1" />
                @endfor
                <line x1="78" y1="170" x2="624" y2="170" stroke="#E6E6E6" stroke-width="1" />

                <text id="chart-tick-top" x="70" y="24" text-anchor="end" font-size="11" fill="#5C6064">{{ \App\Support\Format::rupiah($maxOut) }}</text>
                <text id="chart-tick-mid" x="70" y="99" text-anchor="end" font-size="11" fill="#5C6064">{{ \App\Support\Format::rupiah($maxOut / 2) }}</text>
                <text x="70" y="174" text-anchor="end" font-size="11" fill="#5C6064">Rp 0</text>

                @foreach($series as $idx => $day)
                    @php
                        $colX = 96 + ($idx * 76);
                        $outH = (int) round(((float) $day['out_amount'] / $maxOut) * 145);
                        $barH = max($day['out_amount'] > 0 ? 4 : 0, $outH);
                        $barY = 170 - $barH;
                    @endphp
                    <g data-bar-group="{{ $idx }}">
                        <rect
                            data-bar-rect
                            x="{{ $colX }}"
                            y="{{ $barY }}"
                            width="34"
                            height="{{ $barH }}"
                            rx="5"
                            fill="#1D5FD6"
                        >
                            <title>{{ $day['label'] }}: {{ \App\Support\Format::rupiah((float) $day['out_amount']) }}</title>
                        </rect>
                        <text x="{{ $colX + 17 }}" y="192" text-anchor="middle" font-size="11" fill="#5C6064">{{ $day['label'] }}</text>
                    </g>
                @endforeach
            </svg>
        </div>
    </section>

    <section class="sk-card lg:col-span-5 flex flex-col justify-between">
        <div>
            <h2 class="text-[16px] font-semibold">Komposisi Pengeluaran</h2>
            <p class="text-xs text-[var(--muted)]">Distribusi berdasarkan kategori transaksi</p>

            <div class="mt-4 space-y-3">
                @forelse($analytics['categories'] ?? [] as $cat)
                    <div>
                        <div class="flex items-center justify-between text-xs mb-1">
                            <span class="font-medium">{{ $cat['category'] }}</span>
                            <span class="num font-semibold">{{ \App\Support\Format::rupiah((float) $cat['amount']) }} ({{ $cat['share_percent'] }}%)</span>
                        </div>
                        <div class="h-2 rounded-full bg-[var(--ground)] overflow-hidden">
                            <div class="h-full rounded-full bg-[var(--accent)]" style="width: {{ min(100, (float) $cat['share_percent']) }}%"></div>
                        </div>
                    </div>
                @empty
                    <p class="py-10 text-center text-sm text-[var(--muted)]">Belum ada pengeluaran tercatat.</p>
                @endforelse
            </div>
        </div>

        <p class="mt-4 pt-3 border-t border-[var(--rule)] text-xs text-[var(--muted)]">
            Semua nominal dihitung langsung dari buku besar atomik (double-entry).
        </p>
    </section>
</div>

{{-- Filters & Ledger Table --}}
<section class="sk-card space-y-4">
    <form method="GET" action="{{ route('riwayat') }}" class="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div class="sm:col-span-5 relative">
            <input
                type="text"
                name="q"
                value="{{ $filters['q'] }}"
                placeholder="Cari nama merchant, keterangan, atau nomor referensi..."
                class="sk-input text-sm"
            />
        </div>
        <div class="sm:col-span-3">
            <select name="direction" class="sk-input text-sm">
                <option value="ALL" @selected($filters['direction'] === 'ALL')>Semua Arus Kas</option>
                <option value="IN" @selected($filters['direction'] === 'IN')>Uang Masuk (IN)</option>
                <option value="OUT" @selected($filters['direction'] === 'OUT')>Uang Keluar (OUT)</option>
            </select>
        </div>
        <div class="sm:col-span-2">
            <select name="type" class="sk-input text-sm">
                <option value="ALL" @selected($filters['type'] === 'ALL')>Semua Jenis</option>
                @foreach(['TOPUP', 'QRIS', 'TRANSFER_P2P', 'TRANSFER_BANK', 'PPOB', 'SPLIT_BILL', 'POCKET_MOVE', 'MERCHANT_SETTLE'] as $t)
                    <option value="{{ $t }}" @selected($filters['type'] === $t)>{{ $t }}</option>
                @endforeach
            </select>
        </div>
        <div class="sm:col-span-2 flex gap-2">
            <button type="submit" class="sk-btn sk-btn-primary w-full">Filter</button>
        </div>
    </form>

    {{-- Desktop Table --}}
    <div class="hidden md:block overflow-x-auto">
        <table class="sk-table">
            <thead>
                <tr>
                    <th>Transaksi</th>
                    <th>Referensi</th>
                    <th>Kategori</th>
                    <th>Status</th>
                    <th class="num">Total</th>
                </tr>
            </thead>
            <tbody>
                @forelse($transactions as $tx)
                    @php $isIn = $tx['direction'] === 'IN'; @endphp
                    <tr class="hover:bg-[var(--raised)] cursor-pointer" onclick='window.SakuKilat.openReceiptModal(@json($tx))'>
                        <td>
                            <p class="font-medium text-[var(--text)]">{{ $tx['title'] }}</p>
                            <p class="text-xs text-[var(--faint)]">{{ \App\Support\Format::dateTimeWib($tx['created_at']) }} WIB</p>
                        </td>
                        <td class="font-mono-id text-xs text-[var(--muted)]">{{ $tx['reference_number'] }}</td>
                        <td><span class="sk-pill sk-pill-neutral">{{ $tx['category'] }}</span></td>
                        <td>
                            <span class="sk-pill {{ $tx['status'] === 'SUCCESS' ? 'sk-pill-pos' : ($tx['status'] === 'REVERSED' ? 'sk-pill-warn' : 'sk-pill-neg') }}">
                                {{ $tx['status'] }}
                            </span>
                        </td>
                        <td class="num font-semibold {{ $isIn ? 'text-[var(--positive)]' : 'text-[var(--text)]' }}">
                            {{ \App\Support\Format::signedRupiah((float) $tx['total_amount'], $tx['direction']) }}
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="5" class="py-10 text-center text-sm text-[var(--muted)]">Tidak ada transaksi yang cocok dengan filter Anda.</td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    {{-- Mobile Compact 2-Line Rows --}}
    <div class="md:hidden divide-y divide-[var(--rule)]">
        @forelse($transactions as $tx)
            @php $isIn = $tx['direction'] === 'IN'; @endphp
            <button
                type="button"
                onclick='window.SakuKilat.openReceiptModal(@json($tx))'
                class="w-full py-3 flex items-center justify-between gap-3 text-left"
            >
                <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{{ $tx['title'] }}</p>
                    <p class="text-xs text-[var(--faint)] truncate">{{ $tx['category'] }} • {{ \App\Support\Format::dateTimeWib($tx['created_at']) }}</p>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-sm font-semibold num {{ $isIn ? 'text-[var(--positive)]' : 'text-[var(--text)]' }}">
                        {{ \App\Support\Format::signedRupiah((float) $tx['total_amount'], $tx['direction']) }}
                    </p>
                    <p class="text-[11px] font-mono-id text-[var(--faint)]">{{ $tx['status'] }}</p>
                </div>
            </button>
        @empty
            <p class="py-8 text-center text-sm text-[var(--muted)]">Belum ada transaksi.</p>
        @endforelse
    </div>
</section>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const series = @json($series);
  const maxOut = {{ $maxOut }};
  const maxIn = {{ $maxIn }};
  const btnOut = document.getElementById('chart-mode-out');
  const btnIn = document.getElementById('chart-mode-in');
  const tickTop = document.getElementById('chart-tick-top');
  const tickMid = document.getElementById('chart-tick-mid');

  function renderMode(mode) {
    const isIn = mode === 'in';
    const maxVal = isIn ? maxIn : maxOut;
    const fill = isIn ? '#2F7A45' : '#1D5FD6';

    tickTop.textContent = window.SakuKilat.formatRupiah(maxVal);
    tickMid.textContent = window.SakuKilat.formatRupiah(maxVal / 2);

    btnOut.className = !isIn
      ? 'px-2.5 h-7 rounded-[7px] text-xs font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'
      : 'px-2.5 h-7 rounded-[7px] text-xs font-medium text-[var(--muted)]';
    btnIn.className = isIn
      ? 'px-2.5 h-7 rounded-[7px] text-xs font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'
      : 'px-2.5 h-7 rounded-[7px] text-xs font-medium text-[var(--muted)]';

    series.forEach((d, idx) => {
      const val = Number(isIn ? d.in_amount : d.out_amount);
      const h = val > 0 ? Math.max(4, Math.round((val / maxVal) * 145)) : 0;
      const rect = document.querySelector(`[data-bar-group="${idx}"] [data-bar-rect]`);
      if (rect) {
        rect.setAttribute('height', String(h));
        rect.setAttribute('y', String(170 - h));
        rect.setAttribute('fill', fill);
        const title = rect.querySelector('title');
        if (title) title.textContent = `${d.label}: ${window.SakuKilat.formatRupiah(val)}`;
      }
    });
  }

  btnOut.addEventListener('click', () => renderMode('out'));
  btnIn.addEventListener('click', () => renderMode('in'));
});
</script>
@endsection

