@extends('layouts.app')

@section('content')
<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Bayar &amp; Beli PPOB</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">Pulsa, paket data, token listrik PLN 20-digit instan, tagihan PDAM, BPJS &amp; voucher game</p>
    </div>
    <a href="{{ route('home') }}" class="sk-btn">Kembali</a>
</div>

<div class="flex flex-wrap gap-2 mb-5">
    @foreach([
        ['code' => 'ALL', 'label' => 'Semua Produk'],
        ['code' => 'PULSA', 'label' => 'Pulsa'],
        ['code' => 'DATA', 'label' => 'Paket Data'],
        ['code' => 'PLN', 'label' => 'Listrik PLN'],
        ['code' => 'PDAM', 'label' => 'PDAM'],
        ['code' => 'BPJS', 'label' => 'BPJS'],
        ['code' => 'GAME', 'label' => 'Voucher Game'],
    ] as $cat)
        <button
            type="button"
            data-ppob-cat="{{ $cat['code'] }}"
            class="sk-btn min-h-[34px] px-3.5 text-xs {{ strtoupper($initialCategory) === $cat['code'] ? 'sk-btn-primary' : '' }}"
        >
            {{ $cat['label'] }}
        </button>
    @endforeach
</div>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    <section class="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3" id="ppob-product-grid">
        @foreach($products as $idx => $p)
            @php
                $totalPrice = $p['base_price'] + $p['admin_fee'];
                $matchInit = $initialCategory === 'ALL'
                    || ($initialCategory === 'PLN' && str_starts_with($p['category'], 'PLN'))
                    || $p['category'] === $initialCategory;
            @endphp
            <button
                type="button"
                data-ppob-card
                data-category="{{ $p['category'] }}"
                data-code="{{ $p['code'] }}"
                data-name="{{ $p['name'] }}"
                data-provider="{{ $p['provider'] }}"
                data-base="{{ $p['base_price'] }}"
                data-fee="{{ $p['admin_fee'] }}"
                class="sk-card p-4 text-left hover:border-[var(--accent)] transition-colors flex flex-col justify-between gap-3 {{ $matchInit ? '' : 'hidden' }} {{ $idx === 0 ? 'border-[var(--accent)] bg-[var(--raised)]' : '' }}"
            >
                <div>
                    <div class="flex items-center justify-between gap-2">
                        <span class="sk-pill sk-pill-neutral">{{ $p['provider'] }}</span>
                        <span class="text-[11px] font-mono-id text-[var(--faint)]">{{ $p['category'] }}</span>
                    </div>
                    <h2 class="text-sm font-semibold mt-2 text-[var(--text)]">{{ $p['name'] }}</h2>
                    <p class="text-xs text-[var(--muted)] mt-0.5">{{ $p['description'] }}</p>
                </div>
                <div class="pt-2 border-t border-[var(--rule)] flex items-baseline justify-between">
                    <span class="text-base font-semibold num text-[var(--accent)]">{{ \App\Support\Format::rupiah($totalPrice) }}</span>
                    <span class="text-[11px] text-[var(--faint)] num">Termasuk admin {{ \App\Support\Format::rupiah($p['admin_fee']) }}</span>
                </div>
            </button>
        @endforeach
    </section>

    <aside class="sk-card lg:col-span-5 space-y-4">
        <div>
            <h2 class="text-[16px] font-semibold">Rincian Pembelian / Tagihan</h2>
            <p id="ppob-selected-name" class="text-xs font-medium text-[var(--accent)] mt-0.5">
                {{ $products[0]['name'] }}
            </p>
        </div>

        <div id="ppob-error" class="hidden p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"></div>

        <form id="ppob-form" class="space-y-4">
            <input type="hidden" id="ppob-product-code" value="{{ $products[0]['code'] }}" />

            <div>
                <label for="ppob-customer" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nomor HP / ID Pelanggan / ID Meter PLN</label>
                <div class="flex flex-col sm:flex-row gap-2">
                    <input id="ppob-customer" type="text" value="085211223344" placeholder="Contoh: 085211223344 atau 541200987654" required class="sk-input font-mono-id text-sm" />
                    <button type="button" id="ppob-inquire-btn" class="sk-btn shrink-0">Cek Tagihan</button>
                </div>
            </div>

            <div id="ppob-inquiry-box" class="p-3.5 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-1.5 text-sm">
                <div class="flex justify-between">
                    <span class="text-[var(--muted)]">Pelanggan</span>
                    <span id="inq-customer" class="font-medium font-mono-id">085211223344</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-[var(--muted)]">Harga Produk</span>
                    <span id="inq-base" class="num">{{ \App\Support\Format::rupiah($products[0]['base_price']) }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-[var(--muted)]">Biaya Admin</span>
                    <span id="inq-fee" class="num">{{ \App\Support\Format::rupiah($products[0]['admin_fee']) }}</span>
                </div>
                <div class="pt-2 border-t border-[var(--rule)] flex justify-between font-semibold">
                    <span>Total Bayar</span>
                    <span id="inq-total" class="text-[var(--accent)] num">{{ \App\Support\Format::rupiah($products[0]['base_price'] + $products[0]['admin_fee']) }}</span>
                </div>
            </div>

            <div>
                <label for="ppob-wallet" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Sumber Dana</label>
                <select id="ppob-wallet" class="sk-input text-sm">
                    @foreach($usableWallets as $w)
                        <option value="{{ $w->id }}">{{ $w->name }} — {{ \App\Support\Format::rupiah((float) $w->balance) }}</option>
                    @endforeach
                </select>
            </div>

            <button type="submit" class="w-full sk-btn sk-btn-primary">Bayar &amp; Terbitkan Resi (PIN)</button>
        </form>
    </aside>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const errEl = document.getElementById('ppob-error');
  const codeInput = document.getElementById('ppob-product-code');
  const selectedNameEl = document.getElementById('ppob-selected-name');
  let selectedTotal = {{ $products[0]['base_price'] + $products[0]['admin_fee'] }};

  document.querySelectorAll('[data-ppob-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-ppob-cat');
      document.querySelectorAll('[data-ppob-cat]').forEach((b) => b.classList.remove('sk-btn-primary'));
      btn.classList.add('sk-btn-primary');

      document.querySelectorAll('[data-ppob-card]').forEach((card) => {
        const cardCat = card.getAttribute('data-category');
        const show = cat === 'ALL' || (cat === 'PLN' && cardCat.startsWith('PLN')) || cardCat === cat;
        card.classList.toggle('hidden', !show);
      });
    });
  });

  document.querySelectorAll('[data-ppob-card]').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('[data-ppob-card]').forEach((c) => c.classList.remove('border-[var(--accent)]', 'bg-[var(--raised)]'));
      card.classList.add('border-[var(--accent)]', 'bg-[var(--raised)]');

      const code = card.getAttribute('data-code');
      const base = Number(card.getAttribute('data-base'));
      const fee = Number(card.getAttribute('data-fee'));
      selectedTotal = base + fee;

      codeInput.value = code;
      selectedNameEl.textContent = card.getAttribute('data-name');
      document.getElementById('inq-base').textContent = window.SakuKilat.formatRupiah(base);
      document.getElementById('inq-fee').textContent = window.SakuKilat.formatRupiah(fee);
      document.getElementById('inq-total').textContent = window.SakuKilat.formatRupiah(selectedTotal);
    });
  });

  document.getElementById('ppob-inquire-btn').addEventListener('click', async () => {
    errEl.classList.add('hidden');
    try {
      const data = await window.SakuKilat.api('/api/v1/ppob/inquire', {
        method: 'POST',
        body: JSON.stringify({
          product_code: codeInput.value,
          customer_number: document.getElementById('ppob-customer').value.trim(),
        }),
      });
      selectedTotal = data.total_payable;
      document.getElementById('inq-customer').textContent = `${data.customer_name} (${data.period})`;
      document.getElementById('inq-base').textContent = window.SakuKilat.formatRupiah(data.base_price);
      document.getElementById('inq-fee').textContent = window.SakuKilat.formatRupiah(data.admin_fee);
      document.getElementById('inq-total').textContent = window.SakuKilat.formatRupiah(data.total_payable);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  document.getElementById('ppob-form').addEventListener('submit', (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const idempotencyKey = window.SakuKilat.makeIdempotencyKey('ppob');

    window.SakuKilat.openPinModal({
      title: `Bayar ${selectedNameEl.textContent}`,
      amount: selectedTotal,
      onAuthorized: async (txAuthToken) => {
        try {
          const tx = await window.SakuKilat.api('/api/v1/ppob/execute', {
            method: 'POST',
            idempotencyKey,
            body: JSON.stringify({
              product_code: codeInput.value,
              customer_number: document.getElementById('ppob-customer').value.trim(),
              source_wallet_id: document.getElementById('ppob-wallet').value,
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
});
</script>
@endsection

