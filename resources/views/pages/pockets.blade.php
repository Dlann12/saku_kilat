@extends('layouts.app')

@section('content')
@php
    $usableWallets = $walletSummary['wallets']->filter(fn ($w) => in_array($w->wallet_type, ['MAIN', 'POCKET'], true))->values();
@endphp

<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Kantong Pintar (Smart Pockets)</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">Pisahkan pos belanja, kunci tabungan, dan pindahkan saldo internal Rp 0</p>
    </div>
    <a href="{{ route('home') }}" class="sk-btn">Kembali</a>
</div>

<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
    <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Total Semua Dompet</p>
        <p class="mt-1 text-2xl font-semibold num">{{ \App\Support\Format::rupiah((float) $walletSummary['total_balance']) }}</p>
    </div>
    <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Dompet Utama</p>
        <p class="mt-1 text-2xl font-semibold num">{{ \App\Support\Format::rupiah((float) $walletSummary['main_balance']) }}</p>
    </div>
    <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Total di Kantong Pintar</p>
        <p class="mt-1 text-2xl font-semibold num text-[var(--accent)]">{{ \App\Support\Format::rupiah((float) $walletSummary['pockets_total']) }}</p>
    </div>
</div>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    <section class="lg:col-span-7 space-y-4">
        @if($walletSummary['main_wallet'])
            <div class="sk-card">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-base font-semibold">{{ $walletSummary['main_wallet']->name }}</h2>
                            <span class="sk-pill sk-pill-accent">Utama</span>
                        </div>
                        <p class="text-xs text-[var(--muted)] mt-1">Sumber dana default untuk Top Up, Transfer, dan transaksi umum</p>
                    </div>
                    <p class="text-xl font-semibold num">{{ \App\Support\Format::rupiah((float) $walletSummary['main_wallet']->balance) }}</p>
                </div>
            </div>
        @endif

        @forelse($walletSummary['pockets'] as $pocket)
            @php
                $pc = \App\Support\Format::pocketColors($pocket->category_key);
                $bal = (float) $pocket->balance;
                $target = (float) ($pocket->target_amount ?? 0);
                $pct = $target > 0 ? min(100, (int) round(($bal / $target) * 100)) : 0;
            @endphp
            <div class="sk-card space-y-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="text-base font-semibold">{{ $pocket->name }}</h3>
                            <span class="sk-pill" style="background: {{ $pc['bg'] }}; color: {{ $pc['ink'] }}">{{ $pc['label'] }}</span>
                            @if($pocket->is_locked)
                                <span class="sk-pill sk-pill-neg">Terkunci</span>
                            @endif
                        </div>
                        <p class="text-xs text-[var(--muted)] mt-1">
                            {{ $pocket->is_locked ? 'Saldo dilindungi — tidak bisa dipakai debit sebelum dibuka.' : 'Siap digunakan sebagai sumber dana QRIS, Transfer, atau PPOB.' }}
                        </p>
                    </div>
                    <p class="text-xl font-semibold num">{{ \App\Support\Format::rupiah($bal) }}</p>
                </div>

                @if($target > 0)
                    <div>
                        <div class="flex justify-between text-xs text-[var(--muted)] mb-1">
                            <span>Progres Target</span>
                            <span class="num">{{ \App\Support\Format::rupiah($bal) }} / {{ \App\Support\Format::rupiah($target) }} ({{ $pct }}%)</span>
                        </div>
                        <div class="h-2 w-full rounded-full bg-[var(--ground)] overflow-hidden">
                            <div class="h-full rounded-full bg-[var(--accent)]" style="width: {{ $pct }}%"></div>
                        </div>
                    </div>
                @endif

                <div class="pt-2 border-t border-[var(--rule)] flex flex-wrap items-center justify-between gap-2">
                    <span class="font-mono-id text-xs text-[var(--faint)]">ID: {{ substr($pocket->id, 0, 8) }}</span>
                    <button
                        type="button"
                        data-toggle-lock="{{ $pocket->id }}"
                        data-locked="{{ $pocket->is_locked ? '1' : '0' }}"
                        class="sk-btn min-h-[34px] px-3 text-xs"
                    >
                        <x-icon name="lock" class="w-3.5 h-3.5" />
                        <span>{{ $pocket->is_locked ? 'Buka Kunci Kantong' : 'Kunci Kantong' }}</span>
                    </button>
                </div>
            </div>
        @empty
            <div class="sk-card text-center py-8">
                <p class="text-sm text-[var(--muted)]">Belum ada Kantong Pintar. Buat di sebelah kanan.</p>
            </div>
        @endforelse
    </section>

    <aside class="lg:col-span-5 space-y-5">
        <div class="sk-card space-y-4">
            <div>
                <h2 class="text-[16px] font-semibold">Pindah Saldo Internal (Rp 0)</h2>
                <p class="text-xs text-[var(--muted)]">Pindah instan antara Dompet Utama dan Kantong Pintar tanpa biaya admin</p>
            </div>

            <form id="move-wallet-form" class="space-y-3">
                <div>
                    <label for="move-from" class="block text-xs font-medium text-[var(--muted)] mb-1">Dari Dompet</label>
                    <select id="move-from" class="sk-input text-sm">
                        @foreach($usableWallets as $w)
                            <option value="{{ $w->id }}">{{ $w->name }} ({{ \App\Support\Format::rupiah((float) $w->balance) }})</option>
                        @endforeach
                    </select>
                </div>
                <div>
                    <label for="move-to" class="block text-xs font-medium text-[var(--muted)] mb-1">Ke Dompet Tujuan</label>
                    <select id="move-to" class="sk-input text-sm">
                        @foreach($usableWallets as $w)
                            <option value="{{ $w->id }}" @selected($loop->index === 1)>{{ $w->name }} ({{ \App\Support\Format::rupiah((float) $w->balance) }})</option>
                        @endforeach
                    </select>
                </div>
                <div>
                    <label for="move-amount" class="block text-xs font-medium text-[var(--muted)] mb-1">Nominal Pindah</label>
                    <div class="flex items-center h-10 rounded-[10px] border border-[var(--control)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
                        <span class="text-sm font-semibold text-[var(--muted)] mr-2 shrink-0">Rp</span>
                        <input id="move-amount" type="number" min="1000" step="1000" value="50000" required class="w-full bg-transparent border-0 outline-none text-sm font-semibold num" />
                    </div>
                </div>
                <div id="move-error" class="hidden p-2.5 rounded-[8px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-xs"></div>
                <button type="submit" class="w-full sk-btn sk-btn-primary">Pindahkan Sekarang</button>
            </form>
        </div>

        <div class="sk-card space-y-4">
            <div>
                <h2 class="text-[16px] font-semibold">Buat Kantong Pintar Baru</h2>
                <p class="text-xs text-[var(--muted)]">Buat pos anggaran khusus agar pengeluaran lebih terkontrol</p>
            </div>

            <form id="create-pocket-form" class="space-y-3">
                <div>
                    <label for="pocket-name" class="block text-xs font-medium text-[var(--muted)] mb-1">Nama Kantong</label>
                    <input id="pocket-name" type="text" placeholder="Contoh: Dana Darurat" required class="sk-input text-sm" />
                </div>
                <div>
                    <label for="pocket-category" class="block text-xs font-medium text-[var(--muted)] mb-1">Kategori</label>
                    <select id="pocket-category" class="sk-input text-sm">
                        <option value="savings">Tabungan / Dana Darurat</option>
                        <option value="food">Konsumsi &amp; Harian</option>
                        <option value="transport">Transportasi</option>
                        <option value="bills">Tagihan Rutin</option>
                    </select>
                </div>
                <div>
                    <label for="pocket-target" class="block text-xs font-medium text-[var(--muted)] mb-1">Target Nominal (Opsional)</label>
                    <div class="flex items-center h-10 rounded-[10px] border border-[var(--control)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
                        <span class="text-sm font-semibold text-[var(--muted)] mr-2 shrink-0">Rp</span>
                        <input id="pocket-target" type="number" min="0" step="10000" value="1000000" class="w-full bg-transparent border-0 outline-none text-sm font-semibold num" />
                    </div>
                </div>
                <div id="create-pocket-error" class="hidden p-2.5 rounded-[8px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-xs"></div>
                <button type="submit" class="w-full sk-btn">Buat Kantong Baru</button>
            </form>
        </div>
    </aside>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-toggle-lock]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-toggle-lock');
      const currentlyLocked = btn.getAttribute('data-locked') === '1';
      await window.SakuKilat.api(`/api/v1/wallets/pockets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_locked: !currentlyLocked }),
      });
      location.reload();
    });
  });

  document.getElementById('move-wallet-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('move-error');
    errEl.classList.add('hidden');
    try {
      const tx = await window.SakuKilat.api('/api/v1/wallets/move', {
        method: 'POST',
        idempotencyKey: window.SakuKilat.makeIdempotencyKey('move'),
        body: JSON.stringify({
          source_wallet_id: document.getElementById('move-from').value,
          destination_wallet_id: document.getElementById('move-to').value,
          amount: Number(document.getElementById('move-amount').value),
        }),
      });
      window.SakuKilat.openReceiptModal(tx);
      document.getElementById('sk-rcpt-close')?.addEventListener('click', () => location.reload(), { once: true });
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  document.getElementById('create-pocket-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('create-pocket-error');
    errEl.classList.add('hidden');
    try {
      const target = Number(document.getElementById('pocket-target').value || 0);
      await window.SakuKilat.api('/api/v1/wallets/pockets', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('pocket-name').value.trim(),
          category_key: document.getElementById('pocket-category').value,
          target_amount: target >= 10000 ? target : null,
        }),
      });
      location.reload();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
});
</script>
@endsection
