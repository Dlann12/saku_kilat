@extends('layouts.app')

@section('content')
<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Scan &amp; Bayar QRIS</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">Mendukung kamera perangkat, unggah gambar QR dari galeri, dan standar EMVCo QRIS nasional</p>
    </div>
    <a href="{{ route('home') }}" class="sk-btn">Kembali</a>
</div>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    {{-- Left: Scanner / Gallery Upload / Merchant Presets --}}
    <section class="sk-card lg:col-span-6 space-y-5">
        <div>
            <h2 class="text-[16px] font-semibold">1. Pindai atau Pilih Kode QRIS</h2>
            <p class="text-xs text-[var(--muted)] mt-0.5">Kamera aktif, unggah berkas PNG/JPG, atau coba merchant contoh di bawah</p>
        </div>

        <div class="flex flex-wrap gap-2.5">
            <button type="button" id="qris-cam-toggle" class="sk-btn sk-btn-primary">
                <x-icon name="qris" class="w-4 h-4" />
                <span>Buka Kamera Scanner</span>
            </button>
            <label class="sk-btn cursor-pointer">
                <span>Unggah Gambar QR</span>
                <input id="qris-file-input" type="file" accept="image/*" class="sr-only" />
            </label>
        </div>

        <div id="qris-cam-wrap" class="hidden rounded-[14px] border border-[var(--border)] bg-black overflow-hidden relative">
            <video id="qris-video" playsinline class="w-full max-h-[260px] object-cover"></video>
            <canvas id="qris-canvas" class="hidden"></canvas>
            <div class="p-2.5 bg-[var(--surface)] border-t border-[var(--border)] flex items-center justify-between text-xs">
                <span class="text-[var(--muted)]">Arahkan kamera ke kode QRIS...</span>
                <button type="button" id="qris-cam-stop" class="text-[var(--negative)] font-medium">Matikan Kamera</button>
            </div>
        </div>

        <div class="space-y-2.5">
            <p class="text-xs font-medium text-[var(--muted)]">Contoh Merchant QRIS Terdaftar (Klik untuk Scan Simulasi)</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                @foreach($presets as $preset)
                    <button
                        type="button"
                        data-qris-preset="{{ $preset['payload'] }}"
                        class="text-left p-3 rounded-[12px] border border-[var(--border)] bg-[var(--ground)] hover:bg-[var(--raised)] hover:border-[var(--accent)] transition-colors flex flex-col justify-between gap-2"
                    >
                        <div class="bg-white p-2 rounded-[8px] border border-[var(--border)] flex items-center justify-center">
                            {!! $preset['svg'] !!}
                        </div>
                        <div>
                            <span class="sk-pill sk-pill-accent mb-1">{{ $preset['badge'] }}</span>
                            <p class="text-xs font-semibold leading-snug text-[var(--text)]">{{ $preset['label'] }}</p>
                        </div>
                    </button>
                @endforeach
            </div>
        </div>

        <form id="qris-manual-form" class="pt-4 border-t border-[var(--rule)] space-y-2">
            <label for="qris-raw-input" class="block text-xs font-medium text-[var(--muted)]">Atau tempel Payload String EMVCo QRIS secara manual</label>
            <div class="flex flex-col sm:flex-row gap-2">
                <input id="qris-raw-input" type="text" placeholder="00020101021126..." class="sk-input font-mono-id text-xs" />
                <button type="submit" class="sk-btn shrink-0">Validasi QR</button>
            </div>
        </form>
    </section>

    {{-- Right: Confirmation Screen --}}
    <section class="sk-card lg:col-span-6 space-y-5">
        <div class="flex items-center justify-between gap-2">
            <div>
                <h2 class="text-[16px] font-semibold">2. Layar Konfirmasi Pembayaran</h2>
                <p class="text-xs text-[var(--muted)]">Pastikan nama merchant, nominal, dan sumber dompet sesuai</p>
            </div>
            <span class="sk-pill sk-pill-neutral">Fee Rp 0</span>
        </div>

        <div id="qris-error" class="hidden p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"></div>

        <div id="qris-empty-state" class="p-8 text-center rounded-[14px] border border-dashed border-[var(--control)] bg-[var(--ground)]">
            <p class="text-sm font-medium text-[var(--text)]">Belum ada kode QRIS dipindai</p>
            <p class="text-xs text-[var(--muted)] mt-1">Pilih salah satu merchant contoh di sebelah kiri, unggah gambar QR, atau pindai dengan kamera.</p>
        </div>

        {{-- Profile QR Notice --}}
        <div id="qris-profile-box" class="hidden p-5 rounded-[14px] border border-[var(--border)] bg-[var(--ground)] space-y-3">
            <p class="text-xs font-medium text-[var(--accent-ink)]">QR Profil Pengguna SakuKilat Terdeteksi</p>
            <p id="qris-profile-name" class="text-lg font-semibold"></p>
            <p id="qris-profile-phone" class="font-mono-id text-xs text-[var(--muted)]"></p>
            <a id="qris-profile-link" href="{{ route('transfer') }}" class="sk-btn sk-btn-primary w-full">Lanjutkan Transfer P2P (Rp 0)</a>
        </div>

        {{-- Merchant Confirmation Form --}}
        <form id="qris-confirm-form" class="hidden space-y-4">
            <div class="p-4 rounded-[14px] bg-[var(--ground)] border border-[var(--border)] flex items-center gap-3.5">
                <div id="qris-merchant-initials" class="w-12 h-12 rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] flex items-center justify-center font-semibold text-base shrink-0">
                    MK
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <h3 id="qris-merchant-name" class="text-base font-semibold truncate"></h3>
                        <span id="qris-type-pill" class="sk-pill sk-pill-accent">QRIS</span>
                    </div>
                    <p id="qris-merchant-meta" class="text-xs text-[var(--muted)] mt-0.5 truncate"></p>
                    <p id="qris-merchant-nmid" class="text-[11px] font-mono-id text-[var(--faint)] mt-0.5"></p>
                </div>
            </div>

            <div>
                <label for="qris-amount" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nominal Pembayaran</label>
                <div class="flex items-center h-11 rounded-[10px] border border-[var(--control)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
                    <span class="text-sm font-semibold text-[var(--muted)] mr-2 shrink-0">Rp</span>
                    <input id="qris-amount" type="number" min="1000" max="20000000" step="500" required class="w-full bg-transparent border-0 outline-none text-lg font-semibold num" />
                </div>
                <p id="qris-amount-note" class="mt-1 text-xs text-[var(--muted)]"></p>
            </div>

            <div>
                <label for="qris-wallet" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Pilih Sumber Dana</label>
                <select id="qris-wallet" class="sk-input text-sm">
                    @foreach($usableWallets as $w)
                        <option
                            value="{{ $w->id }}"
                            data-balance="{{ (float) $w->balance }}"
                            data-locked="{{ $w->is_locked ? '1' : '0' }}"
                        >
                            {{ $w->name }} — {{ \App\Support\Format::rupiah((float) $w->balance) }}{{ $w->is_locked ? ' (Terkunci)' : '' }}
                        </option>
                    @endforeach
                </select>
                <p id="qris-wallet-warning" class="hidden mt-1.5 text-xs text-[var(--negative)] font-medium"></p>
            </div>

            <div class="p-3.5 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] flex items-center justify-between text-sm">
                <span class="text-[var(--muted)]">Total Bayar (Admin Rp 0)</span>
                <span id="qris-total-display" class="text-lg font-semibold text-[var(--accent)] num">Rp 0</span>
            </div>

            <button type="submit" id="qris-pay-btn" class="w-full sk-btn sk-btn-primary">
                Bayar Sekarang (Konfirmasi PIN)
            </button>
        </form>
    </section>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const errEl = document.getElementById('qris-error');
  const emptyEl = document.getElementById('qris-empty-state');
  const profileBox = document.getElementById('qris-profile-box');
  const confirmForm = document.getElementById('qris-confirm-form');
  const amountInput = document.getElementById('qris-amount');
  const walletSelect = document.getElementById('qris-wallet');
  const walletWarnEl = document.getElementById('qris-wallet-warning');
  const totalDisplay = document.getElementById('qris-total-display');
  const payBtn = document.getElementById('qris-pay-btn');

  let activeInquiry = null;
  let camStream = null;
  let rafId = null;

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }
  function clearErr() {
    errEl.classList.add('hidden');
  }

  function validateWalletAndTotal() {
    const amt = Number(amountInput.value || 0);
    totalDisplay.textContent = window.SakuKilat.formatRupiah(amt);
    const opt = walletSelect.selectedOptions[0];
    if (!opt) return;
    const bal = Number(opt.getAttribute('data-balance') || 0);
    const locked = opt.getAttribute('data-locked') === '1';

    if (locked) {
      walletWarnEl.textContent = 'Kantong ini sedang dikunci. Pilih dompet lain atau buka kunci terlebih dahulu.';
      walletWarnEl.classList.remove('hidden');
      payBtn.disabled = true;
    } else if (amt > bal) {
      walletWarnEl.textContent = `Saldo dompet terpilih (${window.SakuKilat.formatRupiah(bal)}) tidak cukup untuk transaksi ini.`;
      walletWarnEl.classList.remove('hidden');
      payBtn.disabled = true;
    } else {
      walletWarnEl.classList.add('hidden');
      payBtn.disabled = false;
    }
  }

  amountInput.addEventListener('input', validateWalletAndTotal);
  walletSelect.addEventListener('change', validateWalletAndTotal);

  async function decodePayload(raw) {
    clearErr();
    try {
      const data = await window.SakuKilat.api('/api/v1/payments/qris/decode', {
        method: 'POST',
        body: JSON.stringify({ raw_qr_payload: raw }),
      });

      emptyEl.classList.add('hidden');

      if (data.kind === 'PROFILE') {
        confirmForm.classList.add('hidden');
        profileBox.classList.remove('hidden');
        document.getElementById('qris-profile-name').textContent = data.masked_name;
        document.getElementById('qris-profile-phone').textContent = data.phone_number;
        document.getElementById('qris-profile-link').href = `{{ route('transfer') }}?phone=${encodeURIComponent(data.phone_number)}`;
        return;
      }

      profileBox.classList.add('hidden');
      confirmForm.classList.remove('hidden');
      activeInquiry = { ...data, raw_qr_payload: raw };

      const initials = (data.merchant_name || 'QR')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('');
      document.getElementById('qris-merchant-initials').textContent = initials || 'QR';
      document.getElementById('qris-merchant-name').textContent = data.merchant_name;
      document.getElementById('qris-merchant-meta').textContent = `${data.merchant_city} • ${data.category}`;
      document.getElementById('qris-merchant-nmid').textContent = `NMID: ${data.nmid}`;
      document.getElementById('qris-type-pill').textContent = data.is_dynamic ? 'QRIS Dinamis' : 'QRIS Statis';

      if (data.is_dynamic && data.amount) {
        amountInput.value = String(data.amount);
        amountInput.readOnly = true;
        document.getElementById('qris-amount-note').textContent = 'Nominal dikunci oleh tagihan dinamis merchant.';
      } else {
        amountInput.readOnly = false;
        amountInput.value = String(data.amount || 25000);
        document.getElementById('qris-amount-note').textContent = 'QRIS Statis: masukkan nominal pembayaran sesuai struk kasir.';
      }
      validateWalletAndTotal();
    } catch (err) {
      showErr(err.message);
    }
  }

  document.querySelectorAll('[data-qris-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const payload = btn.getAttribute('data-qris-preset');
      document.getElementById('qris-raw-input').value = payload;
      void decodePayload(payload);
    });
  });

  document.getElementById('qris-manual-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = document.getElementById('qris-raw-input').value.trim();
    if (raw) void decodePayload(raw);
  });

  document.getElementById('qris-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await window.SakuKilat.decodeQrFromImageFile(file);
      document.getElementById('qris-raw-input').value = text;
      await decodePayload(text);
    } catch (err) {
      showErr(err.message);
    }
  });

  function stopCamera() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    camStream?.getTracks().forEach((t) => t.stop());
    camStream = null;
    document.getElementById('qris-cam-wrap').classList.add('hidden');
  }

  document.getElementById('qris-cam-stop').addEventListener('click', stopCamera);

  document.getElementById('qris-cam-toggle').addEventListener('click', async () => {
    clearErr();
    if (camStream) {
      stopCamera();
      return;
    }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.getElementById('qris-video');
      const canvas = document.getElementById('qris-canvas');
      video.srcObject = camStream;
      await video.play();
      document.getElementById('qris-cam-wrap').classList.remove('hidden');

      const tick = () => {
        if (!camStream) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.SakuKilat.jsQR(imgData.data, imgData.width, imgData.height);
          if (code && code.data) {
            stopCamera();
            document.getElementById('qris-raw-input').value = code.data;
            void decodePayload(code.data);
            return;
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } catch {
      showErr('Kamera tidak tersedia atau izin ditolak browser. Gunakan unggah gambar QR atau pilih merchant contoh.');
    }
  });

  confirmForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activeInquiry) return;
    const amt = Number(amountInput.value);
    const idempotencyKey = window.SakuKilat.makeIdempotencyKey('qris');

    window.SakuKilat.openPinModal({
      title: `Bayar QRIS ke ${activeInquiry.merchant_name}`,
      amount: amt,
      onAuthorized: async (txAuthToken) => {
        try {
          const tx = await window.SakuKilat.api('/api/v1/payments/qris/execute', {
            method: 'POST',
            idempotencyKey,
            body: JSON.stringify({
              inquiry_id: activeInquiry.inquiry_id,
              raw_qr_payload: activeInquiry.raw_qr_payload,
              source_wallet_id: walletSelect.value,
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

