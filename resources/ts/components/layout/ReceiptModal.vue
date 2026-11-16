<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { useSessionStore } from '@/stores/session';
import { formatDateTimeWib, formatRupiah } from '@/utils/format';

const store = useSessionStore();
const copied = shallowRef(false);
const sharedFeedback = shallowRef('');

const tx = computed(() => store.activeReceipt);
const meta = computed(() => (tx.value?.metadata ?? {}) as Record<string, string | undefined>);

function handleEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape' && store.activeReceipt) {
    store.closeReceipt();
  }
}

onMounted(() => window.addEventListener('keydown', handleEscape));
onBeforeUnmount(() => window.removeEventListener('keydown', handleEscape));

function copyReference(): void {
  if (!tx.value) return;
  navigator.clipboard?.writeText(tx.value.reference_number);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

async function shareReceipt(): Promise<void> {
  if (!tx.value) return;
  const summary = [
    `Bukti Transaksi Saku`,
    `${tx.value.title} (${tx.value.status})`,
    `Total: ${formatRupiah(tx.value.total_amount)}`,
    `Ref: ${tx.value.reference_number}`,
  ].join('\n');

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Bukti Transaksi Saku', text: summary });
      return;
    } catch {
      // Fallback to clipboard copy
    }
  }
  await navigator.clipboard?.writeText(summary);
  sharedFeedback.value = 'Detail resi disalin ke papan klip.';
  setTimeout(() => {
    sharedFeedback.value = '';
  }, 2400);
}

function downloadSvg(): void {
  if (!tx.value) return;
  const ref = tx.value.reference_number;
  const safeTitle = tx.value.title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="440" height="360" viewBox="0 0 440 360">
  <rect width="440" height="360" fill="#FAF8FF" />
  <rect x="20" y="20" width="400" height="320" rx="20" fill="#FFFFFF" stroke="#DDE2EC" />
  <rect x="20" y="20" width="400" height="58" rx="20" fill="#006948" />
  <text x="40" y="54" font-family="sans-serif" font-size="18" font-weight="700" fill="#FFFFFF">Saku - Bukti Transaksi Resmi</text>
  <text x="40" y="106" font-family="monospace" font-size="12" fill="#526058">Ref: ${ref}</text>
  <line x1="40" y1="122" x2="400" y2="122" stroke="#DDE2EC" stroke-dasharray="5 5" />
  <text x="40" y="152" font-family="sans-serif" font-size="15" font-weight="700" fill="#131B2E">${safeTitle}</text>
  <text x="40" y="176" font-family="sans-serif" font-size="13" fill="#526058">Kategori: ${tx.value.category} | Status: ${tx.value.status}</text>
  <text x="40" y="218" font-family="sans-serif" font-size="13" fill="#526058">Nominal</text>
  <text x="400" y="218" text-anchor="end" font-family="sans-serif" font-size="14" font-weight="600" fill="#131B2E">${formatRupiah(tx.value.amount)}</text>
  <text x="40" y="246" font-family="sans-serif" font-size="13" fill="#526058">Biaya Admin</text>
  <text x="400" y="246" text-anchor="end" font-family="sans-serif" font-size="14" fill="#131B2E">${formatRupiah(tx.value.admin_fee ?? 0)}</text>
  <line x1="40" y1="268" x2="400" y2="268" stroke="#DDE2EC" />
  <text x="40" y="298" font-family="sans-serif" font-size="14" font-weight="700" fill="#131B2E">Total Terbayar</text>
  <text x="400" y="298" text-anchor="end" font-family="sans-serif" font-size="18" font-weight="700" fill="#006948">${formatRupiah(tx.value.total_amount)}</text>
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
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sk-rcpt-heading"
      @click.self="store.closeReceipt()"
    >
      <div
        class="w-full sm:max-w-[440px] max-h-[92dvh] overflow-y-auto bg-[var(--container-low)] border border-[var(--border)] rounded-t-[24px] sm:rounded-[24px] p-5"
        style="box-shadow: 0 18px 44px rgba(19, 27, 46, 0.2)"
      >
        <!-- Status Banner Header -->
        <div class="flex items-start justify-between gap-2 pb-4">
          <div class="flex items-center gap-3">
            <span
              class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white"
              :style="{ background: tx.status === 'REVERSED' ? 'var(--warning)' : 'var(--primary)' }"
            >
              <AppIcon name="check" size-class="w-6 h-6" />
            </span>
            <div>
              <h2 id="sk-rcpt-heading" class="text-[18px] font-bold">
                {{ tx.status === 'REVERSED' ? 'Transaksi Dikembalikan' : 'Transaksi Berhasil!' }}
              </h2>
              <p class="text-xs text-[var(--muted)]">{{ formatDateTimeWib(tx.created_at) }} WIB</p>
            </div>
          </div>

          <button
            type="button"
            class="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[var(--variant)] hover:bg-[var(--surface)]"
            aria-label="Tutup resi"
            @click="store.closeReceipt()"
          >
            <AppIcon name="close" />
          </button>
        </div>

        <!-- Perforated E-Receipt Ticket Card -->
        <div class="bg-[var(--surface)] rounded-[20px] border border-[var(--border)] overflow-hidden">
          <!-- Top Half: Total Terbayar & Ref Copy -->
          <div class="p-5 text-center">
            <p class="text-xs font-semibold text-[var(--muted)]">Total Terbayar</p>
            <p id="sk-rcpt-total-big" class="mt-1 text-[30px] font-bold num text-[var(--text)] tracking-tight">
              {{ formatRupiah(tx.total_amount) }}
            </p>
            <div class="mt-2.5 flex items-center justify-center gap-2 flex-wrap">
              <span
                class="sk-pill"
                :class="tx.status === 'REVERSED' ? 'sk-pill-warn' : 'sk-pill-pos'"
              >
                <AppIcon name="verified" size-class="w-3.5 h-3.5" />
                {{ (tx.admin_fee ?? 0) === 0 ? 'Bebas Biaya Admin' : tx.status }}
              </span>
              <span class="sk-pill sk-pill-neutral">{{ tx.category }}</span>
            </div>

            <div class="mt-4 px-3 py-2.5 rounded-[12px] bg-[var(--container-low)] flex items-center justify-between gap-2">
              <div class="text-left min-w-0">
                <p class="text-[11px] text-[var(--muted)]">No. Referensi</p>
                <p id="sk-rcpt-ref" class="text-xs font-bold font-mono-id truncate">
                  {{ tx.reference_number }}
                </p>
              </div>
              <button
                type="button"
                class="min-h-[36px] px-3 rounded-[9px] bg-[var(--surface)] border border-[var(--border)] text-xs font-semibold text-[var(--primary)] inline-flex items-center gap-1.5 hover:bg-[var(--accent-soft)] shrink-0"
                @click="copyReference"
              >
                <AppIcon :name="copied ? 'check' : 'copy'" size-class="w-3.5 h-3.5" />
                <span>{{ copied ? 'Tersalin' : 'Salin' }}</span>
              </button>
            </div>
          </div>

          <!-- Perforated Divider -->
          <div class="sk-ticket-divider">
            <div class="w-full border-t border-dashed border-[var(--border)] mx-4" />
          </div>

          <!-- Bottom Half: Details -->
          <div class="p-5 space-y-3 text-sm">
            <div>
              <p class="text-xs text-[var(--muted)]">Transaksi / Penerima</p>
              <p id="sk-rcpt-title" class="text-[15px] font-bold mt-0.5 text-[var(--text)]">
                {{ tx.title }}
              </p>
            </div>

            <div
              v-if="meta.tokenNumber"
              class="p-3.5 rounded-[12px] bg-[var(--accent-soft)] border border-[var(--primary)]/25"
            >
              <p class="text-xs font-semibold text-[var(--accent-ink)]">Nomor Token / Voucher</p>
              <p class="mt-1 text-base font-bold text-[var(--accent-ink)] font-mono-id tracking-wider">
                {{ meta.tokenNumber }}
              </p>
            </div>

            <div
              v-if="meta.note"
              class="p-3 rounded-[12px] bg-[var(--container-low)] text-xs text-[var(--variant)]"
            >
              Catatan: "{{ meta.note }}"
            </div>

            <dl class="pt-2 border-t border-[var(--rule)] space-y-2 text-[13px]">
              <div v-if="meta.sourceWalletName" class="flex justify-between gap-4">
                <dt class="text-[var(--muted)]">Sumber Dana</dt>
                <dd class="font-semibold">{{ meta.sourceWalletName }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-[var(--muted)]">Nominal Transaksi</dt>
                <dd class="num font-semibold">{{ formatRupiah(tx.amount) }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-[var(--muted)]">Biaya Admin</dt>
                <dd class="num font-semibold">{{ formatRupiah(tx.admin_fee ?? 0) }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-[var(--muted)]">Status Buku Besar</dt>
                <dd class="font-semibold text-[var(--primary)]">{{ tx.status }}</dd>
              </div>
            </dl>
          </div>
        </div>

        <p v-if="sharedFeedback" class="mt-2 text-xs text-center font-medium text-[var(--primary)]">
          {{ sharedFeedback }}
        </p>

        <!-- Action Buttons -->
        <div class="mt-4 grid grid-cols-2 gap-3">
          <button type="button" class="sk-btn" @click="shareReceipt">
            <AppIcon name="share" />
            <span>Bagikan Bukti</span>
          </button>
          <button type="button" class="sk-btn sk-btn-primary" @click="downloadSvg">
            <AppIcon name="download" />
            <span>Unduh Resi</span>
          </button>
        </div>

        <button
          type="button"
          class="mt-2.5 w-full sk-btn"
          @click="store.closeReceipt()"
        >
          Tutup Resi
        </button>

        <p class="mt-3 text-[11px] text-center text-[var(--muted)]">
          Resi transaksi resmi tercatat dalam jurnal double-entry SakuKilat.
        </p>
      </div>
    </div>
  </Teleport>
</template>
