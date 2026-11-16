import jsQR from 'jsqr';

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}

function makeIdempotencyKey(prefix = 'sk') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function formatRupiah(amount) {
  const num = Number(amount || 0);
  const abs = Math.abs(Math.round(num * 100) / 100);
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);
  return `${num < 0 ? '-' : ''}Rp\u00A0${formatted}`;
}

function formatDateTimeWib(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  headers.set('X-CSRF-TOKEN', csrfToken());
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.idempotencyKey) {
    headers.set('X-Idempotency-Key', options.idempotencyKey);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin',
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json.error || {};
    const error = new Error(err.message || `Permintaan gagal (${res.status})`);
    error.code = err.code || 'API_ERROR';
    error.status = res.status;
    throw error;
  }
  return json.data;
}

// Global PIN Modal controller
let activePinCallback = null;
let currentPinValue = '';

function updatePinDots() {
  const dots = document.querySelectorAll('#sk-pin-dots span');
  dots.forEach((dot, idx) => {
    const filled = idx < currentPinValue.length;
    dot.style.borderColor = filled ? 'var(--accent)' : 'var(--control)';
    dot.style.background = filled ? 'var(--accent)' : 'transparent';
  });
  const input = document.getElementById('pin-keyboard-input');
  if (input && input.value !== currentPinValue) {
    input.value = currentPinValue;
  }
}

async function submitPinValue(pin) {
  if (pin.length !== 6 || !activePinCallback) return;
  const errEl = document.getElementById('sk-pin-error');
  const statusEl = document.getElementById('sk-pin-status');
  if (errEl) errEl.textContent = '';
  if (statusEl) statusEl.classList.remove('hidden');

  try {
    const data = await apiFetch('/api/v1/auth/pin/verify', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
    const cb = activePinCallback;
    closePinModal();
    await cb(data.tx_auth_token);
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'PIN tidak valid.';
    currentPinValue = '';
    updatePinDots();
  } finally {
    if (statusEl) statusEl.classList.add('hidden');
  }
}

function openPinModal({ title = 'Konfirmasi PIN SakuKilat', amount = null, onAuthorized }) {
  activePinCallback = onAuthorized;
  currentPinValue = '';
  const modal = document.getElementById('sk-pin-modal');
  const titleEl = document.getElementById('sk-pin-title');
  const amtEl = document.getElementById('sk-pin-amount');
  const errEl = document.getElementById('sk-pin-error');
  if (titleEl) titleEl.textContent = title;
  if (amtEl) {
    amtEl.textContent = amount !== null ? formatRupiah(amount) : '';
    amtEl.classList.toggle('hidden', amount === null);
  }
  if (errEl) errEl.textContent = '';
  updatePinDots();
  if (modal) modal.classList.remove('hidden');
  document.getElementById('pin-keyboard-input')?.focus();
}

function closePinModal() {
  document.getElementById('sk-pin-modal')?.classList.add('hidden');
  activePinCallback = null;
  currentPinValue = '';
  updatePinDots();
}

// Global Receipt Modal controller
let lastReceiptTx = null;

function openReceiptModal(tx) {
  lastReceiptTx = tx;
  const modal = document.getElementById('sk-receipt-modal');
  if (!modal || !tx) return;

  const isReversed = tx.status === 'REVERSED';
  document.getElementById('sk-rcpt-heading').textContent = isReversed
    ? 'Transaksi Dikembalikan'
    : 'Transaksi Berhasil';
  document.getElementById('sk-rcpt-time').textContent = `${formatDateTimeWib(tx.created_at || tx.createdAt)} WIB`;
  document.getElementById('sk-rcpt-cat').textContent = tx.category || '-';
  document.getElementById('sk-rcpt-title').textContent = tx.title || '-';
  document.getElementById('sk-rcpt-total-big').textContent = formatRupiah(tx.total_amount ?? tx.totalAmount);
  document.getElementById('sk-rcpt-ref').textContent = tx.reference_number || tx.referenceNumber || '-';
  document.getElementById('sk-rcpt-status').textContent = tx.status || 'SUCCESS';
  document.getElementById('sk-rcpt-amount').textContent = formatRupiah(tx.amount);
  document.getElementById('sk-rcpt-fee').textContent = formatRupiah(tx.admin_fee ?? tx.adminFee ?? 0);
  document.getElementById('sk-rcpt-total').textContent = formatRupiah(tx.total_amount ?? tx.totalAmount);

  const meta = tx.metadata || {};
  const srcRow = document.getElementById('sk-rcpt-src-row');
  if (meta.sourceWalletName) {
    document.getElementById('sk-rcpt-src').textContent = meta.sourceWalletName;
    srcRow.classList.remove('hidden');
  } else {
    srcRow.classList.add('hidden');
  }

  const tokenBox = document.getElementById('sk-rcpt-token-box');
  if (meta.tokenNumber) {
    document.getElementById('sk-rcpt-token').textContent = meta.tokenNumber;
    tokenBox.classList.remove('hidden');
  } else {
    tokenBox.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

function closeReceiptModal() {
  document.getElementById('sk-receipt-modal')?.classList.add('hidden');
}

function decodeQrFromImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context unavailable'));
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        resolve(code.data);
      } else {
        reject(new Error('Gambar tidak mengandung kode QRIS yang dapat dibaca.'));
      }
    };
    img.onerror = () => reject(new Error('Gagal memuat berkas gambar.'));
    img.src = URL.createObjectURL(file);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const pinInput = document.getElementById('pin-keyboard-input');
  if (pinInput) {
    pinInput.addEventListener('input', (e) => {
      currentPinValue = e.target.value.replace(/\D/g, '').slice(0, 6);
      updatePinDots();
      if (currentPinValue.length === 6) {
        void submitPinValue(currentPinValue);
      }
    });
  }

  document.querySelectorAll('[data-pin-digit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (currentPinValue.length >= 6) return;
      currentPinValue += btn.getAttribute('data-pin-digit');
      updatePinDots();
      if (currentPinValue.length === 6) {
        void submitPinValue(currentPinValue);
      }
    });
  });

  document.getElementById('sk-pin-backspace')?.addEventListener('click', () => {
    currentPinValue = currentPinValue.slice(0, -1);
    updatePinDots();
  });

  document.getElementById('sk-pin-bio')?.addEventListener('click', async () => {
    const errEl = document.getElementById('sk-pin-error');
    if (errEl) errEl.textContent = '';
    try {
      const data = await apiFetch('/api/v1/auth/biometric', {
        method: 'POST',
        body: JSON.stringify({ action: 'authorize' }),
      });
      const cb = activePinCallback;
      closePinModal();
      if (cb) await cb(data.tx_auth_token);
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Otorisasi biometrik gagal.';
    }
  });

  document.getElementById('sk-pin-close')?.addEventListener('click', closePinModal);
  document.getElementById('sk-rcpt-close')?.addEventListener('click', closeReceiptModal);

  document.getElementById('sk-rcpt-copy')?.addEventListener('click', () => {
    if (!lastReceiptTx) return;
    const ref = lastReceiptTx.reference_number || lastReceiptTx.referenceNumber;
    const summary = [
      '=== RESI DIGITAL SAKUKILAT ===',
      `Ref: ${ref}`,
      `Transaksi: ${lastReceiptTx.title}`,
      `Status: ${lastReceiptTx.status}`,
      `Nominal: ${formatRupiah(lastReceiptTx.amount)}`,
      `Admin: ${formatRupiah(lastReceiptTx.admin_fee ?? lastReceiptTx.adminFee ?? 0)}`,
      `Total: ${formatRupiah(lastReceiptTx.total_amount ?? lastReceiptTx.totalAmount)}`,
    ].join('\n');
    navigator.clipboard?.writeText(summary);
    const btn = document.getElementById('sk-rcpt-copy');
    if (btn) {
      btn.textContent = 'Tersalin';
      setTimeout(() => { btn.textContent = 'Salin Resi'; }, 2000);
    }
  });

  document.getElementById('sk-rcpt-download')?.addEventListener('click', () => {
    if (!lastReceiptTx) return;
    const ref = lastReceiptTx.reference_number || lastReceiptTx.referenceNumber || 'SK';
    const title = String(lastReceiptTx.title || '').replace(/&/g, '&amp;');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="440" height="340" viewBox="0 0 440 340">
  <rect width="440" height="340" fill="#F3F5F7" />
  <rect x="20" y="20" width="400" height="300" rx="16" fill="#FFFFFF" stroke="#E6E6E6" />
  <text x="40" y="56" font-family="sans-serif" font-size="18" font-weight="600" fill="#1D5FD6">SakuKilat - Resi Digital</text>
  <text x="40" y="80" font-family="monospace" font-size="12" fill="#5C6064">${ref}</text>
  <line x1="40" y1="98" x2="400" y2="98" stroke="#E6E6E6" />
  <text x="40" y="130" font-family="sans-serif" font-size="15" font-weight="600" fill="#1B1D1F">${title}</text>
  <text x="40" y="156" font-family="sans-serif" font-size="13" fill="#5C6064">Kategori: ${lastReceiptTx.category} | Status: ${lastReceiptTx.status}</text>
  <text x="40" y="196" font-family="sans-serif" font-size="13" fill="#5C6064">Nominal</text>
  <text x="400" y="196" text-anchor="end" font-family="sans-serif" font-size="14" font-weight="600" fill="#1B1D1F">${formatRupiah(lastReceiptTx.amount)}</text>
  <text x="40" y="224" font-family="sans-serif" font-size="13" fill="#5C6064">Biaya Admin</text>
  <text x="400" y="224" text-anchor="end" font-family="sans-serif" font-size="14" fill="#1B1D1F">${formatRupiah(lastReceiptTx.admin_fee ?? lastReceiptTx.adminFee ?? 0)}</text>
  <line x1="40" y1="244" x2="400" y2="244" stroke="#E6E6E6" />
  <text x="40" y="274" font-family="sans-serif" font-size="14" font-weight="600" fill="#1B1D1F">Total Bayar</text>
  <text x="400" y="274" text-anchor="end" font-family="sans-serif" font-size="18" font-weight="600" fill="#1D5FD6">${formatRupiah(lastReceiptTx.total_amount ?? lastReceiptTx.totalAmount)}</text>
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resi-${ref}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

window.SakuKilat = {
  api: apiFetch,
  makeIdempotencyKey,
  formatRupiah,
  formatDateTimeWib,
  openPinModal,
  closePinModal,
  openReceiptModal,
  closeReceiptModal,
  decodeQrFromImageFile,
  jsQR,
};
