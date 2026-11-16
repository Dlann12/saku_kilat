@extends('layouts.app')

@section('content')
@php
    $bifast = $walletSummary['bifast_quota'] ?? ['used_this_month' => 0, 'free_quota' => 10, 'remaining_free' => 10];
    $bankFee = $bifast['remaining_free'] > 0 ? 0 : 2500;
@endphp

<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Transfer Dana</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">Kirim ke sesama pengguna SakuKilat Rp 0 atau transfer rekening bank BI-FAST</p>
    </div>
    <a href="{{ route('home') }}" class="sk-btn">Kembali</a>
</div>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    <section class="sk-card lg:col-span-7 space-y-5">
        <div class="flex gap-2 p-1 rounded-[12px] bg-[var(--ground)] border border-[var(--border)]">
            <button type="button" id="tf-tab-p2p" class="flex-1 h-9 rounded-[9px] text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]">
                Sesama SakuKilat (Rp 0)
            </button>
            <button type="button" id="tf-tab-bank" class="flex-1 h-9 rounded-[9px] text-sm font-medium text-[var(--muted)]">
                Rekening Bank (BI-FAST)
            </button>
        </div>

        <div id="tf-error" class="hidden p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"></div>

        {{-- Panel 1: P2P Transfer --}}
        <form id="tf-p2p-form" class="space-y-4">
            @if($quickContacts->isNotEmpty())
                <div>
                    <p class="text-xs font-medium text-[var(--muted)] mb-2">Kontak Cepat Terdaftar</p>
                    <div class="flex flex-wrap gap-2">
                        @foreach($quickContacts as $contact)
                            <button
                                type="button"
                                data-quick-phone="{{ $contact->phone_number }}"
                                class="sk-btn min-h-[34px] px-3 text-xs"
                            >
                                {{ $contact->full_name }}
                            </button>
                        @endforeach
                    </div>
                </div>
            @endif

            <div>
                <label for="p2p-phone" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nomor HP Penerima</label>
                <div class="flex flex-col sm:flex-row gap-2">
                    <input id="p2p-phone" type="tel" value="{{ $prefillPhone }}" placeholder="+6281234567890" required class="sk-input" />
                    <button type="button" id="p2p-lookup-btn" class="sk-btn shrink-0">Cek Penerima</button>
                </div>
                <div id="p2p-lookup-result" class="hidden mt-2 p-3 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-xs font-medium"></div>
            </div>

            <div>
                <label for="p2p-wallet" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Sumber Dana</label>
                <select id="p2p-wallet" class="sk-input text-sm">
                    @foreach($usableWallets as $w)
                        <option value="{{ $w->id }}">{{ $w->name }} — {{ \App\Support\Format::rupiah((float) $w->balance) }}{{ $w->is_locked ? ' (Terkunci)' : '' }}</option>
                    @endforeach
                </select>
            </div>

            <div>
                <label for="p2p-amount" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nominal Kirim</label>
                <div class="flex items-center h-11 rounded-[10px] border border-[var(--control)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
                    <span class="text-sm font-semibold text-[var(--muted)] mr-2 shrink-0">Rp</span>
                    <input id="p2p-amount" type="number" min="1000" max="20000000" step="1000" value="50000" required class="w-full bg-transparent border-0 outline-none text-base font-semibold num" />
                </div>
            </div>

            <div>
                <label for="p2p-notes" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Catatan (Opsional)</label>
                <input id="p2p-notes" type="text" placeholder="Bayar makan siang / iuran" class="sk-input text-sm" />
            </div>

            <button type="submit" class="w-full sk-btn sk-btn-primary">Kirim Saldo Sekarang (PIN)</button>
        </form>

        {{-- Panel 2: Bank BI-FAST Transfer --}}
        <div id="tf-bank-panel" class="hidden space-y-4">
            @if($currentUser->kyc_status !== 'VERIFIED')
                <div class="p-4 rounded-[12px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] space-y-2">
                    <p class="text-sm font-semibold">Transfer Bank BI-FAST Memerlukan Akun SakuKilat Plus (KYC)</p>
                    <p class="text-xs leading-relaxed">Untuk keamanan dan regulasi Bank Indonesia, silakan selesaikan verifikasi e-KTP dan liveness di halaman Profil terlebih dahulu.</p>
                    <a href="{{ route('profil') }}" class="sk-btn min-h-[34px] text-xs inline-flex">Verifikasi e-KTP Sekarang</a>
                </div>
            @endif

            <form id="tf-bank-form" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label for="bank-code" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Bank Tujuan</label>
                        <select id="bank-code" class="sk-input text-sm">
                            @foreach(['BCA' => 'Bank BCA', 'MANDIRI' => 'Bank Mandiri', 'BNI' => 'Bank BNI', 'BRI' => 'Bank BRI', 'BSI' => 'Bank Syariah Indonesia (BSI)', 'CIMB' => 'CIMB Niaga', 'JAGO' => 'Bank Jago', 'SEABANK' => 'SeaBank Indonesia'] as $code => $label)
                                <option value="{{ $code }}">{{ $label }}</option>
                            @endforeach
                        </select>
                    </div>
                    <div>
                        <label for="bank-account" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nomor Rekening</label>
                        <input id="bank-account" type="text" inputmode="numeric" placeholder="Contoh: 1234567890" required class="sk-input font-mono-id text-sm" />
                    </div>
                </div>

                <div>
                    <label for="bank-holder" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nama Pemilik Rekening</label>
                    <input id="bank-holder" type="text" placeholder="Contoh: Budi Santoso" required class="sk-input text-sm" />
                </div>

                <div>
                    <label for="bank-wallet" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Sumber Dana</label>
                    <select id="bank-wallet" class="sk-input text-sm">
                        @foreach($usableWallets as $w)
                            <option value="{{ $w->id }}">{{ $w->name }} — {{ \App\Support\Format::rupiah((float) $w->balance) }}</option>
                        @endforeach
                    </select>
                </div>

                <div>
                    <label for="bank-amount" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nominal Transfer (Min Rp 10.000)</label>
                    <div class="flex items-center h-11 rounded-[10px] border border-[var(--control)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
                        <span class="text-sm font-semibold text-[var(--muted)] mr-2 shrink-0">Rp</span>
                        <input id="bank-amount" type="number" min="10000" max="20000000" step="1000" value="100000" required class="w-full bg-transparent border-0 outline-none text-base font-semibold num" />
                    </div>
                </div>

                <div class="p-3.5 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-1.5 text-sm">
                    <div class="flex justify-between">
                        <span class="text-[var(--muted)]">Biaya Admin BI-FAST</span>
                        <span class="font-semibold num {{ $bankFee === 0 ? 'text-[var(--positive)]' : '' }}">
                            {{ $bankFee === 0 ? 'Gratis (Kuota Bulan Ini)' : \App\Support\Format::rupiah($bankFee) }}
                        </span>
                    </div>
                    <div class="flex justify-between font-semibold">
                        <span>Total Terdebit</span>
                        <span id="bank-total-preview" class="text-[var(--accent)] num">{{ \App\Support\Format::rupiah(100000 + $bankFee) }}</span>
                    </div>
                </div>

                <button type="submit" @disabled($currentUser->kyc_status !== 'VERIFIED') class="w-full sk-btn sk-btn-primary">
                    Transfer ke Rekening Bank (PIN)
                </button>
            </form>
        </div>
    </section>

    <aside class="sk-card lg:col-span-5 space-y-4">
        <h2 class="text-[16px] font-semibold">Ringkasan Kuota &amp; Aturan Transfer</h2>
        <div class="p-4 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-2">
            <div class="flex items-center justify-between text-sm">
                <span class="text-[var(--muted)]">Kuota Gratis BI-FAST</span>
                <span class="font-semibold num">{{ $bifast['remaining_free'] }} / {{ $bifast['free_quota'] }}</span>
            </div>
            <div class="h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
                <div class="h-full rounded-full bg-[var(--accent)]" style="width: {{ min(100, (int) round(($bifast['remaining_free'] / max(1, $bifast['free_quota'])) * 100)) }}%"></div>
            </div>
            <p class="text-xs text-[var(--muted)]">10x pertama tiap bulan kalender Rp 0. Transaksi ke-11 dst dikenakan Rp 2.500.</p>
        </div>
        <ul class="space-y-2 text-xs text-[var(--muted)] leading-relaxed">
            <li>• Transfer sesama SakuKilat (P2P) selalu bebas biaya Rp 0 dan menggunakan nama tersamar sebelum otorisasi PIN.</li>
            <li>• Dana langsung masuk ke Dompet Utama penerima dan saldo Anda tidak bisa di-debit jika Kantong Pintar dalam kondisi terkunci.</li>
            <li>• Setiap eksekusi dilindungi idempotency key sehingga klik ganda tidak mendebit dua kali.</li>
        </ul>
    </aside>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const errEl = document.getElementById('tf-error');
  const tabP2p = document.getElementById('tf-tab-p2p');
  const tabBank = document.getElementById('tf-tab-bank');
  const p2pForm = document.getElementById('tf-p2p-form');
  const bankPanel = document.getElementById('tf-bank-panel');
  const bankFee = {{ $bankFee }};

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }

  tabP2p.addEventListener('click', () => {
    p2pForm.classList.remove('hidden');
    bankPanel.classList.add('hidden');
    tabP2p.className = 'flex-1 h-9 rounded-[9px] text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]';
    tabBank.className = 'flex-1 h-9 rounded-[9px] text-sm font-medium text-[var(--muted)]';
  });

  tabBank.addEventListener('click', () => {
    p2pForm.classList.add('hidden');
    bankPanel.classList.remove('hidden');
    tabBank.className = 'flex-1 h-9 rounded-[9px] text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]';
    tabP2p.className = 'flex-1 h-9 rounded-[9px] text-sm font-medium text-[var(--muted)]';
  });

  async function lookupRecipient() {
    errEl.classList.add('hidden');
    const out = document.getElementById('p2p-lookup-result');
    try {
      const phone = document.getElementById('p2p-phone').value.trim();
      const data = await window.SakuKilat.api(`/api/v1/transfers/lookup?phone=${encodeURIComponent(phone)}`);
      out.textContent = `Penerima Terverifikasi: ${data.masked_name} (${data.phone_number})`;
      out.classList.remove('hidden');
    } catch (err) {
      out.classList.add('hidden');
      showErr(err.message);
    }
  }

  document.getElementById('p2p-lookup-btn').addEventListener('click', () => void lookupRecipient());
  document.querySelectorAll('[data-quick-phone]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('p2p-phone').value = btn.getAttribute('data-quick-phone');
      void lookupRecipient();
    });
  });

  p2pForm.addEventListener('submit', (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const amt = Number(document.getElementById('p2p-amount').value);
    const idempotencyKey = window.SakuKilat.makeIdempotencyKey('p2p');

    window.SakuKilat.openPinModal({
      title: 'Konfirmasi Transfer Sesama SakuKilat',
      amount: amt,
      onAuthorized: async (txAuthToken) => {
        try {
          const tx = await window.SakuKilat.api('/api/v1/transfers/p2p', {
            method: 'POST',
            idempotencyKey,
            body: JSON.stringify({
              recipient_phone: document.getElementById('p2p-phone').value.trim(),
              source_wallet_id: document.getElementById('p2p-wallet').value,
              amount: amt,
              notes: document.getElementById('p2p-notes').value.trim(),
              tx_auth_token: txAuthToken,
            }),
          });
          window.SakuKilat.openReceiptModal(tx);
          document.getElementById('sk-rcpt-close')?.addEventListener('click', () => location.reload(), { once: true });
        } catch (err) {
          showErr(err.message);
        }
      },
    });
  });

  document.getElementById('bank-amount').addEventListener('input', (e) => {
    const val = Number(e.target.value || 0);
    document.getElementById('bank-total-preview').textContent = window.SakuKilat.formatRupiah(val + bankFee);
  });

  document.getElementById('tf-bank-form').addEventListener('submit', (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const amt = Number(document.getElementById('bank-amount').value);
    const idempotencyKey = window.SakuKilat.makeIdempotencyKey('bank');

    window.SakuKilat.openPinModal({
      title: 'Konfirmasi Transfer Bank BI-FAST',
      amount: amt + bankFee,
      onAuthorized: async (txAuthToken) => {
        try {
          const tx = await window.SakuKilat.api('/api/v1/transfers/bank', {
            method: 'POST',
            idempotencyKey,
            body: JSON.stringify({
              bank_code: document.getElementById('bank-code').value,
              account_number: document.getElementById('bank-account').value.trim(),
              account_holder_name: document.getElementById('bank-holder').value.trim(),
              source_wallet_id: document.getElementById('bank-wallet').value,
              amount: amt,
              tx_auth_token: txAuthToken,
            }),
          });
          window.SakuKilat.openReceiptModal(tx);
          document.getElementById('sk-rcpt-close')?.addEventListener('click', () => location.reload(), { once: true });
        } catch (err) {
          showErr(err.message);
        }
      },
    });
  });
});
</script>
@endsection

