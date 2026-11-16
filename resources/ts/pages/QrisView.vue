<script setup lang="ts">
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { computed, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';
import FeatureDisabledNotice from '@/components/common/FeatureDisabledNotice.vue';
import MoneyInput from '@/components/common/MoneyInput.vue';
import QrCodeBox from '@/components/common/QrCodeBox.vue';
import { useSessionStore } from '@/stores/session';
import type { QrisDecodeResult, QrisPreset, TransactionRecord } from '@/types/sakukilat';
import { apiFetch, makeIdempotencyKey } from '@/utils/api';
import { decodeQrFromImageFile, formatRupiah, getInitials } from '@/utils/format';

const route = useRoute();
const store = useSessionStore();

const mode = shallowRef<'scan' | 'my-qr'>(route.query.tab === 'my-qr' ? 'my-qr' : 'scan');
const presets = ref<QrisPreset[]>([]);
const rawPayload = shallowRef('');
const errorMsg = shallowRef('');
const shareFeedback = shallowRef('');
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

const myQrPayload = computed(() =>
  store.user ? `SAKUKILAT:USER:${store.user.phone_number}` : 'SAKUKILAT:USER'
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

const merchantInitials = computed(() => getInitials(inquiry.value?.merchant_name || 'QR'));

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
    errorMsg.value = 'Kamera tidak tersedia atau izin ditolak browser. Gunakan unggah gambar atau contoh merchant.';
  }
}

function submitPayment(): void {
  if (!inquiry.value || inquiry.value.kind !== 'QRIS' || walletWarning.value) return;
  const activeInq = inquiry.value;
  const payAmount = amount.value;
  const walletId = selectedWallet.value?.id || '';
  const idempotencyKey = makeIdempotencyKey('qris');

  store.requestPin({
    title: 'Konfirmasi Pembayaran QRIS',
    amount: payAmount,
    recipientName: activeInq.merchant_name,
    recipientSub: `NMID: ${activeInq.nmid}`,
    adminFee: 0,
    sourceWalletName: selectedWallet.value?.name ?? 'Saku Utama',
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

async function copyMyQr(): Promise<void> {
  if (!store.user) return;
  const text = `Terima transfer Saku: ${store.user.full_name} (${store.user.phone_number})`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'QR Saku Saya', text });
      return;
    } catch {
      // fallback
    }
  }
  await navigator.clipboard?.writeText(myQrPayload.value);
  shareFeedback.value = 'Kode QR Saku Anda disalin ke papan klip.';
  setTimeout(() => {
    shareFeedback.value = '';
  }, 2400);
}

async function downloadMyQrPng(): Promise<void> {
  const dataUrl = await QRCode.toDataURL(myQrPayload.value, {
    width: 480,
    margin: 2,
    color: { dark: '#006948', light: '#FFFFFF' },
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `qr-saku-${store.user?.phone_number || 'akun'}.png`;
  a.click();
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-bold tracking-tight">QRIS Bayar &amp; QR Saya</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Pindai QRIS merchant dengan kamera, galeri, atau bagikan QR Saku pribadi Anda
        </p>
      </div>
      <div class="w-full sm:w-auto sm:min-w-[280px]">
        <div class="sk-segmented" role="tablist" aria-label="Mode QRIS">
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'scan'"
            class="sk-segmented-btn"
            :class="{ 'is-active': mode === 'scan' }"
            @click="mode = 'scan'"
          >
            <AppIcon name="qris" size-class="w-4 h-4" />
            <span>Pindai QR</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'my-qr'"
            class="sk-segmented-btn"
            :class="{ 'is-active': mode === 'my-qr' }"
            @click="
              stopCamera();
              mode = 'my-qr';
            "
          >
            <AppIcon name="qr-request" size-class="w-4 h-4" />
            <span>QR Saya</span>
          </button>
        </div>
      </div>
    </div>

    <FeatureDisabledNotice :enabled="store.canUse('allow_qris')" feature-name="Pembayaran QRIS" />

    <!-- Mode 1: Pindai QR -->
    <div v-if="mode === 'scan'" class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="sk-card lg:col-span-6 space-y-5">
        <div>
          <h2 class="text-[16px] font-bold">1. Viewfinder &amp; Merchant QRIS</h2>
          <p class="text-xs text-[var(--muted)] mt-0.5">
            Aktifkan kamera langsung, unggah foto QR dari galeri, atau pilih merchant contoh
          </p>
        </div>

        <div class="flex flex-wrap gap-2.5">
          <button type="button" class="sk-btn sk-btn-primary" @click="toggleCamera">
            <AppIcon name="qris" />
            <span>{{ camActive ? 'Matikan Kamera' : 'Buka Kamera Scanner' }}</span>
          </button>
          <label class="sk-btn cursor-pointer">
            <AppIcon name="gallery" />
            <span>Galeri Foto QR</span>
            <input type="file" accept="image/*" class="sr-only" @change="handleFileUpload" />
          </label>
        </div>

        <div v-show="camActive" class="rounded-[16px] border border-[var(--border)] bg-[#0f172a] overflow-hidden">
          <video ref="camVideo" playsinline class="w-full max-h-[260px] object-cover" />
          <canvas ref="camCanvas" class="hidden" />
          <div class="p-3 bg-[var(--surface)] border-t border-[var(--border)] flex items-center justify-between text-xs">
            <span class="font-medium text-[var(--variant)]">Arahkan kamera ke kotak kode QRIS...</span>
            <button type="button" class="text-[var(--negative)] font-bold" @click="stopCamera">Matikan</button>
          </div>
        </div>

        <div class="space-y-2.5">
          <p class="text-xs font-bold text-[var(--variant)]">Contoh Merchant QRIS Terdaftar</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              v-for="preset in presets"
              :key="preset.id"
              type="button"
              data-qris-preset
              class="text-left p-3 rounded-[14px] border border-[var(--border)] bg-[var(--container-low)] hover:bg-[var(--container)] hover:border-[var(--primary)] transition-colors flex flex-col justify-between gap-2"
              @click="decodePayload(preset.payload)"
            >
              <div class="bg-white p-2 rounded-[10px] border border-[var(--border)] flex items-center justify-center">
                <QrCodeBox :value="preset.payload" :size="112" :alt="preset.label" />
              </div>
              <div>
                <span class="sk-pill sk-pill-accent mb-1">{{ preset.badge }}</span>
                <p class="text-xs font-bold leading-snug text-[var(--text)]">{{ preset.label }}</p>
              </div>
            </button>
          </div>
        </div>

        <form class="pt-4 border-t border-[var(--rule)] space-y-2" @submit.prevent="decodePayload(rawPayload.trim())">
          <label for="qris-raw-input" class="block text-xs font-semibold text-[var(--muted)]">
            Masukkan Kode / String EMVCo QRIS Manual
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
            <h2 class="text-[16px] font-bold">2. Konfirmasi &amp; Sumber Dana</h2>
            <p class="text-xs text-[var(--muted)]">Pastikan merchant dan dompet sumber sudah tepat</p>
          </div>
          <span class="sk-pill sk-pill-pos">Admin Rp 0</span>
        </div>

        <div
          v-if="errorMsg"
          class="p-3 rounded-[12px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm font-medium"
        >
          {{ errorMsg }}
        </div>

        <div
          v-if="!inquiry"
          class="p-8 text-center rounded-[16px] border border-dashed border-[var(--control)] bg-[var(--container-low)]"
        >
          <p class="text-sm font-bold text-[var(--text)]">Belum ada kode QRIS dipindai</p>
          <p class="text-xs text-[var(--muted)] mt-1">
            Ketuk salah satu merchant contoh, unggah gambar QR, atau pindai lewat kamera.
          </p>
        </div>

        <div
          v-else-if="inquiry.kind === 'PROFILE'"
          class="p-5 rounded-[16px] border border-[var(--border)] bg-[var(--container-low)] space-y-3"
        >
          <p class="text-xs font-bold text-[var(--accent-ink)]">QR Profil Saku Terdeteksi</p>
          <p class="text-lg font-bold">{{ inquiry.masked_name }}</p>
          <p class="font-mono-id text-xs text-[var(--muted)]">{{ inquiry.phone_number }}</p>
          <RouterLink
            :to="`/transfer?phone=${encodeURIComponent(inquiry.phone_number || '')}`"
            class="sk-btn sk-btn-primary w-full"
          >
            Lanjutkan Kirim Saldo (Rp 0)
          </RouterLink>
        </div>

        <form v-else class="space-y-4" @submit.prevent="submitPayment">
          <div class="p-4 rounded-[16px] bg-[var(--container-low)] border border-[var(--border)] flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] flex items-center justify-center font-bold text-base shrink-0">
              {{ merchantInitials }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 id="qris-merchant-name" class="text-base font-bold truncate">{{ inquiry.merchant_name }}</h3>
                <span class="sk-pill sk-pill-accent">{{ inquiry.is_dynamic ? 'QRIS Dinamis' : 'QRIS Statis' }}</span>
              </div>
              <p class="text-xs text-[var(--muted)] mt-0.5 truncate">
                {{ inquiry.merchant_city }} • {{ inquiry.category }}
              </p>
              <p class="text-[11px] font-mono-id text-[var(--muted)] mt-0.5">NMID: {{ inquiry.nmid }}</p>
            </div>
          </div>

          <div>
            <label for="qris-amount" class="block text-xs font-semibold text-[var(--muted)] mb-1.5">
              Nominal Pembayaran
            </label>
            <MoneyInput id="qris-amount" v-model="amount" :step="500" :readonly="Boolean(inquiry.is_dynamic && inquiry.amount)" />
            <p class="mt-1 text-xs text-[var(--muted)]">
              {{
                inquiry.is_dynamic && inquiry.amount
                  ? 'Nominal dikunci oleh tagihan dinamis merchant.'
                  : 'QRIS Statis: masukkan nominal sesuai tagihan kasir.'
              }}
            </p>
          </div>

          <div>
            <label for="qris-wallet" class="block text-xs font-semibold text-[var(--muted)] mb-1.5">
              Sumber Pembayaran
            </label>
            <select id="qris-wallet" v-model="selectedWalletId" class="sk-input text-sm">
              <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                {{ w.name }} - {{ formatRupiah(w.balance) }}{{ w.is_locked ? ' (Terkunci)' : '' }}
              </option>
            </select>
            <p v-if="walletWarning" class="mt-1.5 text-xs text-[var(--negative)] font-semibold">
              {{ walletWarning }}
            </p>
          </div>

          <div class="p-3.5 rounded-[14px] bg-[var(--container-low)] border border-[var(--border)] flex items-center justify-between text-sm">
            <span class="text-[var(--muted)]">Total Bayar (Admin Rp 0)</span>
            <span class="text-lg font-bold text-[var(--primary)] num">{{ formatRupiah(amount) }}</span>
          </div>

          <button
            id="qris-pay-btn"
            type="submit"
            :disabled="!store.canUse('allow_qris') || Boolean(walletWarning)"
            class="w-full sk-btn sk-btn-primary"
          >
            Bayar Sekarang (Konfirmasi PIN)
          </button>
        </form>
      </section>
    </div>

    <!-- Mode 2: QR Saya -->
    <section v-else class="max-w-[520px] mx-auto sk-card space-y-5 text-center">
      <div class="flex flex-col items-center gap-2">
        <span class="w-14 h-14 rounded-full bg-[var(--primary)] text-white text-lg font-bold flex items-center justify-center">
          {{ getInitials(store.user?.full_name) }}
        </span>
        <div>
          <h2 class="text-[18px] font-bold">{{ store.user?.full_name || 'Pengguna Saku' }}</h2>
          <p class="text-xs font-mono-id text-[var(--muted)] mt-0.5">
            SAKU ID: {{ store.user?.phone_number || '-' }}
          </p>
        </div>
      </div>

      <div class="inline-flex p-4 rounded-[20px] bg-white border border-[var(--border)] mx-auto">
        <QrCodeBox :value="myQrPayload" :size="220" alt="QR Saku Pribadi" />
      </div>

      <p class="text-xs text-[var(--muted)] max-w-[340px] mx-auto leading-relaxed">
        Tunjukkan kode QR ini ke pengirim sesama Saku untuk menerima transfer instan tanpa biaya admin.
      </p>

      <p v-if="shareFeedback" class="text-xs font-semibold text-[var(--primary)]">
        {{ shareFeedback }}
      </p>

      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="sk-btn" @click="copyMyQr">
          <AppIcon name="share" />
          <span>Bagikan QR</span>
        </button>
        <button type="button" class="sk-btn sk-btn-primary" @click="downloadMyQrPng">
          <AppIcon name="download" />
          <span>Unduh PNG</span>
        </button>
      </div>
    </section>
  </div>
</template>
