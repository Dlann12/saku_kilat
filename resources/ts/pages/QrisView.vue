<script setup lang="ts">
import jsQR from 'jsqr';
import { computed, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import MoneyInput from '@/components/common/MoneyInput.vue';
import QrCodeBox from '@/components/common/QrCodeBox.vue';
import { useSessionStore } from '@/stores/session';
import type { QrisDecodeResult, QrisPreset, TransactionRecord } from '@/types/sakukilat';
import { apiFetch, makeIdempotencyKey } from '@/utils/api';
import { decodeQrFromImageFile, formatRupiah } from '@/utils/format';

const store = useSessionStore();
const presets = ref<QrisPreset[]>([]);
const rawPayload = shallowRef('');
const errorMsg = shallowRef('');
const inquiry = ref<(QrisDecodeResult & { raw_qr_payload: string }) | null>(null);
const amount = shallowRef(25000);
const selectedWalletId = shallowRef('');

const camActive = shallowRef(false);
const videoRef = useTemplateRef<HTMLVideoElement>('camVideo');
const canvasRef = useTemplateRef<HTMLCanvasElement>('camCanvas');
let camStream: MediaStream | null = null;
let rafId: number | null = null;

const usableWallets = computed(() =>
  (store.walletSummary?.wallets ?? []).filter((w) => ['MAIN', 'POCKET'].includes(w.wallet_type))
);

const selectedWallet = computed(() =>
  usableWallets.value.find((w) => w.id === selectedWalletId.value) ?? usableWallets.value[0] ?? null
);

const walletWarning = computed(() => {
  const w = selectedWallet.value;
  if (!w) return '';
  if (w.is_locked) return 'Kantong ini sedang dikunci. Pilih dompet lain atau buka kunci terlebih dahulu.';
  if (amount.value > Number(w.balance)) {
    return `Saldo dompet terpilih (${formatRupiah(w.balance)}) tidak cukup untuk transaksi ini.`;
  }
  return '';
});

const merchantInitials = computed(() =>
  (inquiry.value?.merchant_name || 'QR')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
);

async function loadQrisPage(): Promise<void> {
  if (!store.user) return;
  const [presetRes] = await Promise.all([
    apiFetch<{ presets: QrisPreset[] }>('/api/v1/payments/qris/presets'),
    store.fetchWallets(),
  ]);
  presets.value = presetRes.presets;
  if (!selectedWalletId.value && usableWallets.value.length) {
    selectedWalletId.value = usableWallets.value[0].id;
  }
}

watch(() => store.user?.id, () => void loadQrisPage(), { immediate: true });

function stopCamera(): void {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
  camActive.value = false;
}

onUnmounted(stopCamera);

async function decodePayload(raw: string): Promise<void> {
  errorMsg.value = '';
  rawPayload.value = raw;
  try {
    const res = await apiFetch<QrisDecodeResult>('/api/v1/payments/qris/decode', {
      method: 'POST',
      body: { raw_qr_payload: raw },
    });
    inquiry.value = { ...res, raw_qr_payload: raw };
    if (res.kind === 'QRIS') {
      amount.value = res.is_dynamic && res.amount ? res.amount : 25000;
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'QRIS tidak valid.';
  }
}

async function handleFileUpload(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const decodedText = await decodeQrFromImageFile(file);
    await decodePayload(decodedText);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal membaca gambar QR.';
  }
}

async function toggleCamera(): Promise<void> {
  if (camActive.value) {
    stopCamera();
    return;
  }
  errorMsg.value = '';
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    camActive.value = true;
    const video = videoRef.value;
    const canvas = canvasRef.value;
    if (!video || !canvas) return;
    video.srcObject = camStream;
    await video.play();

    const tick = () => {
      if (!camStream || !videoRef.value || !canvasRef.value) return;
      if (videoRef.value.readyState === videoRef.value.HAVE_ENOUGH_DATA) {
        canvasRef.value.width = videoRef.value.videoWidth;
        canvasRef.value.height = videoRef.value.videoHeight;
        const ctx = canvasRef.value.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.value, 0, 0, canvasRef.value.width, canvasRef.value.height);
          const imgData = ctx.getImageData(0, 0, canvasRef.value.width, canvasRef.value.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height);
          if (code?.data) {
            stopCamera();
            void decodePayload(code.data);
            return;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  } catch {
    errorMsg.value = 'Kamera tidak tersedia atau izin ditolak browser. Gunakan unggah gambar atau preset merchant.';
  }
}

function submitPayment(): void {
  if (!inquiry.value || inquiry.value.kind !== 'QRIS' || walletWarning.value) return;
  const activeInq = inquiry.value;
  const payAmount = amount.value;
  const walletId = selectedWallet.value?.id || '';
  const idempotencyKey = makeIdempotencyKey('qris');

  store.requestPin({
    title: `Bayar QRIS ke ${activeInq.merchant_name}`,
    amount: payAmount,
    onAuthorized: async (txAuthToken) => {
      try {
        const tx = await apiFetch<TransactionRecord>('/api/v1/payments/qris/execute', {
          method: 'POST',
          idempotencyKey,
          body: {
            inquiry_id: activeInq.inquiry_id,
            raw_qr_payload: activeInq.raw_qr_payload,
            source_wallet_id: walletId,
            amount: payAmount,
            tx_auth_token: txAuthToken,
          },
        });
        await store.fetchWallets();
        store.openReceipt(tx);
      } catch (err) {
        errorMsg.value = err instanceof Error ? err.message : 'Pembayaran QRIS gagal.';
      }
    },
  });
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Scan &amp; Bayar QRIS</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Mendukung kamera perangkat, unggah gambar QR dari galeri, dan standar EMVCo QRIS nasional
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Kembali</RouterLink>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="sk-card lg:col-span-6 space-y-5">
        <div>
          <h2 class="text-[16px] font-semibold">1. Pindai atau Pilih Kode QRIS</h2>
          <p class="text-xs text-[var(--muted)] mt-0.5">
            Kamera aktif, unggah berkas PNG/JPG, atau coba merchant contoh di bawah
          </p>
        </div>

        <div class="flex flex-wrap gap-2.5">
          <button type="button" class="sk-btn sk-btn-primary" @click="toggleCamera">
            <AppIcon name="qris" />
            <span>{{ camActive ? 'Matikan Kamera' : 'Buka Kamera Scanner' }}</span>
          </button>
          <label class="sk-btn cursor-pointer">
            <span>Unggah Gambar QR</span>
            <input type="file" accept="image/*" class="sr-only" @change="handleFileUpload" />
          </label>
        </div>

        <div v-show="camActive" class="rounded-[14px] border border-[var(--border)] bg-black overflow-hidden">
          <video ref="camVideo" playsinline class="w-full max-h-[260px] object-cover" />
          <canvas ref="camCanvas" class="hidden" />
          <div class="p-2.5 bg-[var(--surface)] border-t border-[var(--border)] flex items-center justify-between text-xs">
            <span class="text-[var(--muted)]">Arahkan kamera ke kode QRIS...</span>
            <button type="button" class="text-[var(--negative)] font-medium" @click="stopCamera">Matikan</button>
          </div>
        </div>

        <div class="space-y-2.5">
          <p class="text-xs font-medium text-[var(--muted)]">Contoh Merchant QRIS Terdaftar (Klik untuk Scan Simulasi)</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              v-for="preset in presets"
              :key="preset.id"
              type="button"
              data-qris-preset
              class="text-left p-3 rounded-[12px] border border-[var(--border)] bg-[var(--ground)] hover:bg-[var(--raised)] hover:border-[var(--accent)] transition-colors flex flex-col justify-between gap-2"
              @click="decodePayload(preset.payload)"
            >
              <div class="bg-white p-2 rounded-[8px] border border-[var(--border)] flex items-center justify-center">
                <QrCodeBox :value="preset.payload" :size="120" :alt="preset.label" />
              </div>
              <div>
                <span class="sk-pill sk-pill-accent mb-1">{{ preset.badge }}</span>
                <p class="text-xs font-semibold leading-snug text-[var(--text)]">{{ preset.label }}</p>
              </div>
            </button>
          </div>
        </div>

        <form class="pt-4 border-t border-[var(--rule)] space-y-2" @submit.prevent="decodePayload(rawPayload.trim())">
          <label for="qris-raw-input" class="block text-xs font-medium text-[var(--muted)]">
            Atau tempel Payload String EMVCo QRIS secara manual
          </label>
          <div class="flex flex-col sm:flex-row gap-2">
            <input
              id="qris-raw-input"
              v-model="rawPayload"
              type="text"
              placeholder="00020101021126..."
              class="sk-input font-mono-id text-xs"
            />
            <button type="submit" class="sk-btn shrink-0">Validasi QR</button>
          </div>
        </form>
      </section>

      <section class="sk-card lg:col-span-6 space-y-5">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="text-[16px] font-semibold">2. Layar Konfirmasi Pembayaran</h2>
            <p class="text-xs text-[var(--muted)]">Pastikan nama merchant, nominal, dan sumber dompet sesuai</p>
          </div>
          <span class="sk-pill sk-pill-neutral">Fee Rp 0</span>
        </div>

        <div
          v-if="errorMsg"
          class="p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"
        >
          {{ errorMsg }}
        </div>

        <div
          v-if="!inquiry"
          class="p-8 text-center rounded-[14px] border border-dashed border-[var(--control)] bg-[var(--ground)]"
        >
          <p class="text-sm font-medium text-[var(--text)]">Belum ada kode QRIS dipindai</p>
          <p class="text-xs text-[var(--muted)] mt-1">
            Pilih salah satu merchant contoh di sebelah kiri, unggah gambar QR, atau pindai dengan kamera.
          </p>
        </div>

        <div
          v-else-if="inquiry.kind === 'PROFILE'"
          class="p-5 rounded-[14px] border border-[var(--border)] bg-[var(--ground)] space-y-3"
        >
          <p class="text-xs font-medium text-[var(--accent-ink)]">QR Profil Pengguna SakuKilat Terdeteksi</p>
          <p class="text-lg font-semibold">{{ inquiry.masked_name }}</p>
          <p class="font-mono-id text-xs text-[var(--muted)]">{{ inquiry.phone_number }}</p>
          <RouterLink
            :to="`/transfer?phone=${encodeURIComponent(inquiry.phone_number || '')}`"
            class="sk-btn sk-btn-primary w-full"
          >
            Lanjutkan Transfer P2P (Rp 0)
          </RouterLink>
        </div>

        <form v-else class="space-y-4" @submit.prevent="submitPayment">
          <div class="p-4 rounded-[14px] bg-[var(--ground)] border border-[var(--border)] flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] flex items-center justify-center font-semibold text-base shrink-0">
              {{ merchantInitials }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 id="qris-merchant-name" class="text-base font-semibold truncate">{{ inquiry.merchant_name }}</h3>
                <span class="sk-pill sk-pill-accent">{{ inquiry.is_dynamic ? 'QRIS Dinamis' : 'QRIS Statis' }}</span>
              </div>
              <p class="text-xs text-[var(--muted)] mt-0.5 truncate">
                {{ inquiry.merchant_city }} • {{ inquiry.category }}
              </p>
              <p class="text-[11px] font-mono-id text-[var(--faint)] mt-0.5">NMID: {{ inquiry.nmid }}</p>
            </div>
          </div>

          <div>
            <label for="qris-amount" class="block text-xs font-medium text-[var(--muted)] mb-1.5">
              Nominal Pembayaran
            </label>
            <MoneyInput id="qris-amount" v-model="amount" :step="500" :readonly="Boolean(inquiry.is_dynamic && inquiry.amount)" />
            <p class="mt-1 text-xs text-[var(--muted)]">
              {{
                inquiry.is_dynamic && inquiry.amount
                  ? 'Nominal dikunci oleh tagihan dinamis merchant.'
                  : 'QRIS Statis: masukkan nominal pembayaran sesuai struk kasir.'
              }}
            </p>
          </div>

          <div>
            <label for="qris-wallet" class="block text-xs font-medium text-[var(--muted)] mb-1.5">
              Pilih Sumber Dana
            </label>
            <select id="qris-wallet" v-model="selectedWalletId" class="sk-input text-sm">
              <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                {{ w.name }} — {{ formatRupiah(w.balance) }}{{ w.is_locked ? ' (Terkunci)' : '' }}
              </option>
            </select>
            <p v-if="walletWarning" class="mt-1.5 text-xs text-[var(--negative)] font-medium">
              {{ walletWarning }}
            </p>
          </div>

          <div class="p-3.5 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] flex items-center justify-between text-sm">
            <span class="text-[var(--muted)]">Total Bayar (Admin Rp 0)</span>
            <span class="text-lg font-semibold text-[var(--accent)] num">{{ formatRupiah(amount) }}</span>
          </div>

          <button id="qris-pay-btn" type="submit" :disabled="Boolean(walletWarning)" class="w-full sk-btn sk-btn-primary">
            Bayar Sekarang (Konfirmasi PIN)
          </button>
        </form>
      </section>
    </div>
  </div>
</template>

