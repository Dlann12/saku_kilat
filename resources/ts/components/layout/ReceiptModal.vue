<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { useSessionStore } from '@/stores/session';
import { formatDateTimeWib, formatRupiah } from '@/utils/format';

const store = useSessionStore();
const copied = shallowRef(false);

const tx = computed(() => store.activeReceipt);
const meta = computed(() => (tx.value?.metadata ?? {}) as Record<string, string | undefined>);

function copyReceipt(): void {
  if (!tx.value) return;
  const lines = [
    '=== RESI DIGITAL SAKUKILAT ===',
    `Ref: ${tx.value.reference_number}`,
    `Transaksi: ${tx.value.title}`,
    `Status: ${tx.value.status}`,
    `Nominal: ${formatRupiah(tx.value.amount)}`,
    `Admin: ${formatRupiah(tx.value.admin_fee ?? 0)}`,
    `Total: ${formatRupiah(tx.value.total_amount)}`,
  ].join('\n');
  navigator.clipboard?.writeText(lines);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function downloadSvg(): void {
  if (!tx.value) return;
  const ref = tx.value.reference_number;
  const safeTitle = tx.value.title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="440" height="340" viewBox="0 0 440 340">
  <rect width="440" height="340" fill="#F3F5F7" />
  <rect x="20" y="20" width="400" height="300" rx="16" fill="#FFFFFF" stroke="#E6E6E6" />
  <text x="40" y="56" font-family="sans-serif" font-size="18" font-weight="600" fill="#1D5FD6">SakuKilat - Resi Digital</text>
  <text x="40" y="80" font-family="monospace" font-size="12" fill="#5C6064">${ref}</text>
  <line x1="40" y1="98" x2="400" y2="98" stroke="#E6E6E6" />
  <text x="40" y="130" font-family="sans-serif" font-size="15" font-weight="600" fill="#1B1D1F">${safeTitle}</text>
  <text x="40" y="156" font-family="sans-serif" font-size="13" fill="#5C6064">Kategori: ${tx.value.category} | Status: ${tx.value.status}</text>
  <text x="40" y="196" font-family="sans-serif" font-size="13" fill="#5C6064">Nominal</text>
  <text x="400" y="196" text-anchor="end" font-family="sans-serif" font-size="14" font-weight="600" fill="#1B1D1F">${formatRupiah(tx.value.amount)}</text>
  <text x="40" y="224" font-family="sans-serif" font-size="13" fill="#5C6064">Biaya Admin</text>
  <text x="400" y="224" text-anchor="end" font-family="sans-serif" font-size="14" fill="#1B1D1F">${formatRupiah(tx.value.admin_fee ?? 0)}</text>
  <line x1="40" y1="244" x2="400" y2="244" stroke="#E6E6E6" />
  <text x="40" y="274" font-family="sans-serif" font-size="14" font-weight="600" fill="#1B1D1F">Total Bayar</text>
  <text x="400" y="274" text-anchor="end" font-family="sans-serif" font-size="18" font-weight="600" fill="#1D5FD6">${formatRupiah(tx.value.total_amount)}</text>
</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resi-${ref}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="tx"
      id="sk-receipt-modal"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sk-rcpt-heading"
    >
      <div
        class="w-full sm:max-w-[440px] bg-[var(--surface)] border border-[var(--border)] rounded-t-[20px] sm:rounded-[20px] p-6"
        style="box-shadow: 0 12px 32px rgba(27, 29, 31, 0.14)"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 id="sk-rcpt-heading" class="text-[17px] font-semibold">
              {{ tx.status === 'REVERSED' ? 'Transaksi Dikembalikan' : 'Transaksi Berhasil' }}
            </h2>
            <p class="text-xs text-[var(--muted)]">{{ formatDateTimeWib(tx.created_at) }} WIB</p>
          </div>
          <button
            type="button"
            class="w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--muted)] hover:bg-[var(--raised)]"
            aria-label="Tutup resi"
            @click="store.closeReceipt()"
          >
            <AppIcon name="close" />
          </button>
        </div>

        <div class="mt-5 p-4 rounded-[12px] bg-[var(--ground)] border border-[var(--border)]">
          <p class="text-xs text-[var(--muted)]">{{ tx.category }}</p>
          <p id="sk-rcpt-title" class="text-base font-semibold mt-0.5">{{ tx.title }}</p>
          <p id="sk-rcpt-total-big" class="text-2xl font-semibold num mt-2">
            {{ formatRupiah(tx.total_amount) }}
          </p>
        </div>

        <div
          v-if="meta.tokenNumber"
          class="mt-3 p-3.5 rounded-[10px] bg-[var(--accent-soft)] border border-[#bfe1ff]"
        >
          <p class="text-xs font-medium text-[var(--accent-ink)]">Nomor Token / Voucher Digital</p>
          <p class="mt-1 text-base font-semibold text-[var(--accent-ink)] font-mono-id tracking-wider">
            {{ meta.tokenNumber }}
          </p>
        </div>

        <dl class="mt-4 space-y-2.5 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-[var(--muted)]">Nomor Referensi</dt>
            <dd id="sk-rcpt-ref" class="font-mono-id text-xs font-medium">{{ tx.reference_number }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-[var(--muted)]">Status</dt>
            <dd>
              <span
                class="sk-pill"
                :class="tx.status === 'REVERSED' ? 'sk-pill-warn' : 'sk-pill-pos'"
              >
                {{ tx.status }}
              </span>
            </dd>
          </div>
          <div v-if="meta.sourceWalletName" class="flex justify-between gap-4">
            <dt class="text-[var(--muted)]">Sumber Dana</dt>
            <dd class="font-medium">{{ meta.sourceWalletName }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-[var(--muted)]">Nominal Transaksi</dt>
            <dd class="num font-medium">{{ formatRupiah(tx.amount) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-[var(--muted)]">Biaya Admin</dt>
            <dd class="num font-medium">{{ formatRupiah(tx.admin_fee ?? 0) }}</dd>
          </div>
          <div class="pt-2.5 border-t border-[var(--rule)] flex justify-between gap-4 font-semibold">
            <dt>Total Dibayarkan</dt>
            <dd class="num text-[var(--accent)]">{{ formatRupiah(tx.total_amount) }}</dd>
          </div>
        </dl>

        <div class="mt-5 grid grid-cols-2 gap-3">
          <button type="button" class="sk-btn" @click="copyReceipt">
            {{ copied ? 'Tersalin' : 'Salin Resi' }}
          </button>
          <button type="button" class="sk-btn sk-btn-primary" @click="downloadSvg">
            Unduh Resi
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
