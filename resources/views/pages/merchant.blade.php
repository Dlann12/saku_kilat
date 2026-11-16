@extends('layouts.app')

@section('content')
@php
    $merchants = $dashboard['merchants'] ?? [];
    $primaryMerchant = $merchants[0] ?? null;
    $merchantOwnerPersona = $demoPersonas->firstWhere('role', 'MERCHANT');
@endphp

<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">SakuKilat Bisnis (Merchant UMKM)</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">Kelola kode QRIS dinamis per transaksi dan pencairan instan saldo toko (Rp 2.500)</p>
    </div>
    <a href="{{ route('home') }}" class="sk-btn">Beranda</a>
</div>

@if(!($dashboard['is_owner'] ?? false) && $merchantOwnerPersona)
    <div class="mb-5 p-4 rounded-[14px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] flex flex-wrap items-center justify-between gap-3">
        <div class="text-sm">
            Anda sedang melihat pratinjau publik. Beralihlah ke akun <strong>{{ $merchantOwnerPersona->full_name }}</strong> untuk mencairkan saldo settlement toko.
        </div>
        <form method="POST" action="{{ route('demo.switch') }}">
            @csrf
            <input type="hidden" name="user_id" value="{{ $merchantOwnerPersona->id }}" />
            <button type="submit" class="sk-btn min-h-[34px] text-xs">Masuk sebagai {{ $merchantOwnerPersona->full_name }}</button>
        </form>
    </div>
@endif

<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
    <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Saldo Settlement Tersedia</p>
        <p class="mt-1 text-2xl font-semibold num text-[var(--positive)]">{{ \App\Support\Format::rupiah((float) ($dashboard['total_settlement_balance'] ?? 0)) }}</p>
    </div>
    <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Omzet QRIS Sukses</p>
        <p class="mt-1 text-2xl font-semibold num">{{ \App\Support\Format::rupiah((float) ($dashboard['total_qris_gross'] ?? 0)) }}</p>
    </div>
    <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Total Toko Terdaftar</p>
        <p class="mt-1 text-2xl font-semibold num">{{ count($merchants) }} Outlet</p>
    </div>
</div>

@if($primaryMerchant)
<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start mb-5">
    {{-- QRIS Generator --}}
    <section class="sk-card lg:col-span-6 space-y-4">
        <div class="flex items-start justify-between gap-2">
            <div>
                <h2 class="text-[16px] font-semibold">{{ $primaryMerchant['merchant_name'] }}</h2>
                <p class="text-xs text-[var(--muted)]">{{ $primaryMerchant['merchant_city'] }} • Skala {{ $primaryMerchant['category_scale'] }} (MDR {{ $primaryMerchant['mdr_bps'] / 100 }}%)</p>
                <p class="font-mono-id text-[11px] text-[var(--faint)] mt-0.5">NMID: {{ $primaryMerchant['nmid'] }}</p>
            </div>
            <span class="sk-pill sk-pill-pos">Aktif</span>
        </div>

        <form id="merchant-qr-form" class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label for="m-select" class="block text-xs font-medium text-[var(--muted)] mb-1">Pilih Outlet Merchant</label>
                    <select id="m-select" class="sk-input text-sm">
                        @foreach($merchants as $m)
                            <option value="{{ $m['id'] }}">{{ $m['merchant_name'] }}</option>
                        @endforeach
                    </select>
                </div>
                <div>
                    <label for="m-qr-amount" class="block text-xs font-medium text-[var(--muted)] mb-1">Nominal Tagihan QRIS Dinamis</label>
                    <div class="flex items-center h-10 rounded-[10px] border border-[var(--control)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
                        <span class="text-sm font-semibold text-[var(--muted)] mr-2 shrink-0">Rp</span>
                        <input id="m-qr-amount" type="number" min="1000" step="500" value="45000" class="w-full bg-transparent border-0 outline-none text-sm font-semibold num" />
                    </div>
                </div>
            </div>
            <button type="submit" class="w-full sk-btn sk-btn-primary">Buat QRIS Dinamis Kasir</button>
        </form>

        <div class="p-4 rounded-[14px] border border-[var(--border)] bg-[var(--ground)] flex flex-col items-center text-center">
            <div id="m-qr-svg-box" class="bg-white p-3 rounded-[10px] border border-[var(--border)]">
                {!! $primaryMerchant['static_qris_svg'] !!}
            </div>
            <p id="m-qr-label" class="text-xs font-medium mt-2.5">QRIS Statis Outlet (bisa langsung dipindai)</p>
            <p id="m-qr-payload" class="mt-1 font-mono-id text-[11px] text-[var(--muted)] break-all max-w-full">{{ $primaryMerchant['static_qris_payload'] }}</p>
        </div>
    </section>

    {{-- Instant Settlement --}}
    <section class="sk-card lg:col-span-6 space-y-4">
        <div>
            <h2 class="text-[16px] font-semibold">Pencairan Instan ke Rekening Bank (Settlement)</h2>
            <p class="text-xs text-[var(--muted)] mt-0.5">Biaya pencairan flat Rp 2.500 per instruksi, langsung tercatat ke buku besar ganda.</p>
        </div>

        <div id="m-settle-error" class="hidden p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"></div>

        <form id="merchant-settle-form" class="space-y-3.5">
            <div>
                <label for="settle-merchant" class="block text-xs font-medium text-[var(--muted)] mb-1">Outlet Sumber Dana</label>
                <select id="settle-merchant" class="sk-input text-sm">
                    @foreach($merchants as $m)
                        <option value="{{ $m['id'] }}">{{ $m['merchant_name'] }} — {{ \App\Support\Format::rupiah($m['balance']) }}</option>
                    @endforeach
                </select>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label for="settle-bank" class="block text-xs font-medium text-[var(--muted)] mb-1">Bank Tujuan</label>
                    <select id="settle-bank" class="sk-input text-sm">
                        <option value="BCA">Bank BCA</option>
                        <option value="MANDIRI">Bank Mandiri</option>
                        <option value="BRI">Bank BRI</option>
                        <option value="BNI">Bank BNI</option>
                    </select>
                </div>
                <div>
                    <label for="settle-account" class="block text-xs font-medium text-[var(--muted)] mb-1">Nomor Rekening</label>
                    <input id="settle-account" type="text" value="8810023456" required class="sk-input font-mono-id text-sm" />
                </div>
            </div>
            <div>
                <label for="settle-amount" class="block text-xs font-medium text-[var(--muted)] mb-1">Nominal Cairkan Kotor (Min Rp 10.000)</label>
                <div class="flex items-center h-10 rounded-[10px] border border-[var(--control)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
                    <span class="text-sm font-semibold text-[var(--muted)] mr-2 shrink-0">Rp</span>
                    <input id="settle-amount" type="number" min="10000" step="1000" value="100000" required class="w-full bg-transparent border-0 outline-none text-sm font-semibold num" />
                </div>
            </div>

            <button type="submit" @disabled(!($dashboard['is_owner'] ?? false)) class="w-full sk-btn sk-btn-primary">
                Cairkan Dana Sekarang (PIN)
            </button>
        </form>

        <div class="pt-3 border-t border-[var(--rule)]">
            <h3 class="text-sm font-semibold mb-2">Transaksi Masuk QRIS Terkini</h3>
            <div class="divide-y divide-[var(--rule)] max-h-[220px] overflow-y-auto">
                @forelse($dashboard['incoming_qris'] ?? [] as $qtx)
                    <div class="py-2 flex items-center justify-between gap-2 text-xs">
                        <div class="min-w-0">
                            <p class="font-medium truncate text-[var(--text)]">{{ $qtx->title }}</p>
                            <p class="font-mono-id text-[11px] text-[var(--faint)]">{{ $qtx->reference_number }}</p>
                        </div>
                        <span class="font-semibold num text-[var(--positive)]">+{{ \App\Support\Format::rupiah((float) $qtx->amount) }}</span>
                    </div>
                @empty
                    <p class="py-4 text-center text-xs text-[var(--muted)]">Belum ada transaksi masuk.</p>
                @endforelse
            </div>
        </div>
    </section>
</div>
@endif

<script>
document.addEventListener('DOMContentLoaded', () => {
  const qrForm = document.getElementById('merchant-qr-form');
  if (qrForm) {
    qrForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = await window.SakuKilat.api('/api/v1/merchant/qris', {
        method: 'POST',
        body: JSON.stringify({
          merchant_id: document.getElementById('m-select').value,
          amount: Number(document.getElementById('m-qr-amount').value),
          is_dynamic: true,
        }),
      });
      document.getElementById('m-qr-svg-box').innerHTML = data.qr_svg;
      document.getElementById('m-qr-label').textContent = `QRIS Dinamis — ${window.SakuKilat.formatRupiah(data.amount)}`;
      document.getElementById('m-qr-payload').textContent = data.raw_qr_payload;
    });
  }

  const settleForm = document.getElementById('merchant-settle-form');
  if (settleForm) {
    settleForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const errEl = document.getElementById('m-settle-error');
      errEl.classList.add('hidden');
      const amt = Number(document.getElementById('settle-amount').value);
      const idempotencyKey = window.SakuKilat.makeIdempotencyKey('settle');

      window.SakuKilat.openPinModal({
        title: 'Konfirmasi Pencairan Saldo Merchant',
        amount: amt,
        onAuthorized: async (txAuthToken) => {
          try {
            const tx = await window.SakuKilat.api('/api/v1/merchant/settle', {
              method: 'POST',
              idempotencyKey,
              body: JSON.stringify({
                merchant_id: document.getElementById('settle-merchant').value,
                destination_bank: document.getElementById('settle-bank').value,
                account_number: document.getElementById('settle-account').value.trim(),
                amount: amt,
                tx_auth_token: txAuthToken,
              }),
            });
            window.SakuKilat.openReceiptModal(tx);
            document.getElementById('sk-rcpt-close')?.addEventListener('click', () => location.reload(), { once: true });
          } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        },
      });
    });
  }
});
</script>
@endsection

