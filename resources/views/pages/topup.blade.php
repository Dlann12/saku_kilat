@extends('layouts.app')

@section('content')
@php
    $totalBal = (float) ($walletSummary['total_balance'] ?? 0);
    $limitBal = (float) ($walletSummary['balance_limit'] ?? 2_000_000);
    $remainingCap = max(0, $limitBal - $totalBal);
@endphp

<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Top Up Saldo</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">Isi ulang Dompet Utama instan melalui Virtual Account, Gerai Ritel, atau Kartu Debit</p>
    </div>
    <a href="{{ route('home') }}" class="sk-btn">Kembali</a>
</div>

@if($currentUser->kyc_status !== 'VERIFIED')
    <div class="mb-5 p-4 rounded-[14px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] flex flex-wrap items-center justify-between gap-3">
        <div class="text-sm">
            <strong>Akun Basic (Limit Rp 2.000.000):</strong>
            Sisa kapasitas Top Up saat ini <span class="font-semibold num">{{ \App\Support\Format::rupiah($remainingCap) }}</span>.
        </div>
        <a href="{{ route('profil') }}" class="sk-btn min-h-[34px] text-xs">Upgrade ke SakuKilat Plus</a>
    </div>
@endif

<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    <section class="sk-card lg:col-span-7 space-y-5">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-[12px] bg-[var(--ground)] border border-[var(--border)]">
            <div>
                <p class="text-xs text-[var(--muted)]">Total Saldo Saat Ini</p>
                <p class="text-lg font-semibold num">{{ \App\Support\Format::rupiah($totalBal) }}</p>
            </div>
            <div>
                <p class="text-xs text-[var(--muted)]">Batas Maksimum Akun</p>
                <p class="text-lg font-semibold num">{{ \App\Support\Format::rupiah($limitBal) }}</p>
            </div>
        </div>

        <form id="topup-form" class="space-y-4">
            <div>
                <label class="block text-xs font-medium text-[var(--muted)] mb-2">1. Pilih Metode Isi Saldo</label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    @foreach($channels as $code => $ch)
                        <label class="p-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] cursor-pointer flex items-start gap-2.5">
                            <input type="radio" name="channel" value="{{ $code }}" @checked($loop->first) class="mt-1 accent-[var(--accent)]" data-fee="{{ $ch['fee'] }}" data-label="{{ $ch['label'] }}" />
                            <div class="min-w-0">
                                <p class="text-sm font-semibold leading-tight">{{ $ch['label'] }}</p>
                                <p class="text-xs text-[var(--muted)] mt-0.5 num">
                                    {{ $ch['fee'] > 0 ? 'Admin ' . \App\Support\Format::rupiah($ch['fee']) : 'Gratis Biaya Admin' }}
                                </p>
                            </div>
                        </label>
                    @endforeach
                </div>
            </div>

            <div>
                <label for="topup-amount" class="block text-xs font-medium text-[var(--muted)] mb-2">2. Nominal Top Up (Minimal Rp 10.000)</label>
                <div class="flex items-center h-11 rounded-[10px] border border-[var(--control)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
                    <span class="text-sm font-semibold text-[var(--muted)] mr-2 shrink-0">Rp</span>
                    <input id="topup-amount" type="number" min="10000" max="20000000" step="1000" value="100000" required class="w-full bg-transparent border-0 outline-none text-base font-semibold num" />
                </div>
                <div class="mt-2.5 flex flex-wrap gap-2">
                    @foreach([50000, 100000, 250000, 500000, 1000000] as $preset)
                        <button type="button" data-topup-preset="{{ $preset }}" class="sk-btn min-h-[34px] px-3 text-xs num">
                            {{ \App\Support\Format::rupiah($preset) }}
                        </button>
                    @endforeach
                </div>
            </div>

            <div class="p-3.5 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] flex items-center justify-between text-sm">
                <span class="text-[var(--muted)]">Total Masuk ke Dompet Utama</span>
                <span id="topup-preview-total" class="text-base font-semibold text-[var(--accent)] num">Rp 100.000</span>
            </div>

            <div id="topup-error" class="hidden p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"></div>

            <button type="submit" id="btn-create-topup" class="w-full sk-btn sk-btn-primary">
                Buat Nomor Virtual Account / Instruksi
            </button>
        </form>

        {{-- Active Sandbox VA Payment Simulator Box --}}
        <div id="topup-instruction-box" class="hidden p-4 rounded-[14px] border border-[#bfe1ff] bg-[var(--raised)] space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p class="text-xs font-medium text-[var(--accent-ink)]" id="inst-channel">Instruksi Pembayaran</p>
                    <p class="text-xs text-[var(--muted)]">Menunggu pelunasan dari bank mitra (Webhook HMAC-SHA256)</p>
                </div>
                <span class="sk-pill sk-pill-warn">MENUNGGU</span>
            </div>

            <div class="p-3 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p class="text-xs text-[var(--muted)]">Nomor Virtual Account / Kode Bayar</p>
                    <p id="inst-va" class="text-lg font-semibold font-mono-id tracking-wider mt-0.5"></p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-[var(--muted)]">Nominal</p>
                    <p id="inst-amount" class="text-base font-semibold num"></p>
                </div>
            </div>

            <button type="button" id="btn-simulate-va" class="w-full sk-btn sk-btn-dark">
                Simulasikan Bayar Sekarang (Trigger Webhook Bank)
            </button>
        </div>
    </section>

    <aside class="sk-card lg:col-span-5">
        <h2 class="text-[16px] font-semibold">Permintaan Top Up Terakhir</h2>
        <p class="text-xs text-[var(--muted)] mt-0.5">Order status PENDING bisa langsung disimulasikan</p>

        <div class="mt-4 divide-y divide-[var(--rule)]">
            @forelse($walletSummary['topup_orders'] ?? [] as $order)
                <div class="py-3 first:pt-0 last:pb-0 space-y-2">
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <p class="text-sm font-medium truncate">{{ $order->channel_label }}</p>
                            <p class="text-xs font-mono-id text-[var(--muted)]">{{ $order->va_number }}</p>
                        </div>
                        <span class="sk-pill {{ $order->status === 'PAID' ? 'sk-pill-pos' : 'sk-pill-warn' }}">
                            {{ $order->status }}
                        </span>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-sm font-semibold num">{{ \App\Support\Format::rupiah((float) $order->amount) }}</span>
                        @if($order->status === 'PENDING')
                            <button
                                type="button"
                                data-trigger-ref="{{ $order->external_ref }}"
                                class="sk-btn min-h-[32px] px-3 text-xs"
                            >
                                Simulasi Bayar
                            </button>
                        @else
                            <span class="text-xs text-[var(--faint)]">{{ \App\Support\Format::dateTimeWib(optional($order->paid_at)->toIso8601String()) }}</span>
                        @endif
                    </div>
                </div>
            @empty
                <p class="py-8 text-center text-sm text-[var(--muted)]">Belum ada riwayat permintaan Top Up.</p>
            @endforelse
        </div>
    </aside>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const amountInput = document.getElementById('topup-amount');
  const previewEl = document.getElementById('topup-preview-total');
  const errEl = document.getElementById('topup-error');
  const instBox = document.getElementById('topup-instruction-box');
  let activeRef = '';

  function refreshPreview() {
    const val = Number(amountInput.value || 0);
    previewEl.textContent = window.SakuKilat.formatRupiah(val);
  }
  amountInput.addEventListener('input', refreshPreview);

  document.querySelectorAll('[data-topup-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      amountInput.value = btn.getAttribute('data-topup-preset');
      refreshPreview();
    });
  });

  async function triggerVaWebhook(externalRef) {
    errEl.classList.add('hidden');
    try {
      const data = await window.SakuKilat.api('/api/v1/sandbox/trigger-va', {
        method: 'POST',
        body: JSON.stringify({ external_ref: externalRef }),
      });
      if (data.transaction) {
        window.SakuKilat.openReceiptModal(data.transaction);
        document.getElementById('sk-rcpt-close')?.addEventListener('click', () => location.reload(), { once: true });
      } else {
        location.reload();
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }

  document.getElementById('topup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const selected = document.querySelector('input[name="channel"]:checked');
    if (!selected) return;

    try {
      const order = await window.SakuKilat.api('/api/v1/topups', {
        method: 'POST',
        body: JSON.stringify({
          channel: selected.value,
          amount: Number(amountInput.value),
        }),
      });
      activeRef = order.external_ref;
      document.getElementById('inst-channel').textContent = order.channel_label;
      document.getElementById('inst-va').textContent = order.va_number;
      document.getElementById('inst-amount').textContent = window.SakuKilat.formatRupiah(order.amount);
      instBox.classList.remove('hidden');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  document.getElementById('btn-simulate-va').addEventListener('click', () => {
    if (activeRef) void triggerVaWebhook(activeRef);
  });

  document.querySelectorAll('[data-trigger-ref]').forEach((btn) => {
    btn.addEventListener('click', () => void triggerVaWebhook(btn.getAttribute('data-trigger-ref')));
  });
});
</script>
@endsection
