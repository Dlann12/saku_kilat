<script setup lang="ts">
import { reactive, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';
import FeatureDisabledNotice from '@/components/common/FeatureDisabledNotice.vue';
import QrCodeBox from '@/components/common/QrCodeBox.vue';
import { useSessionStore } from '@/stores/session';
import { apiFetch } from '@/utils/api';
import { formatRupiah, getInitials } from '@/utils/format';

interface KycDoc {
  id: string;
  full_name_ktp: string;
  status: string;
  rejection_reason?: string | null;
}

const router = useRouter();
const store = useSessionStore();
const balanceLimit = shallowRef(2_000_000);
const latestKyc = ref<KycDoc | null>(null);
const kycError = shallowRef('');
const kycSuccess = shallowRef('');
const loading = shallowRef(true);

const kycForm = reactive({
  nik: '',
  fullName: '',
  ktpUrl: 'sandbox://kyc/ktp-front-demo.jpg',
  selfieUrl: 'sandbox://kyc/selfie-liveness-demo.jpg',
  liveness: true,
});

async function loadProfile(): Promise<void> {
  if (!store.user) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const [me] = await Promise.all([
      apiFetch<{ balance_limit: number; latest_kyc: KycDoc | null }>('/api/v1/auth/me'),
      store.walletSummary ? Promise.resolve(store.walletSummary) : store.fetchWallets(),
    ]);
    balanceLimit.value = me.balance_limit;
    latestKyc.value = me.latest_kyc;
    kycForm.fullName = store.user.full_name;
  } finally {
    loading.value = false;
  }
}

watch(() => store.user?.id, () => void loadProfile(), { immediate: true });

async function toggleBiometric(): Promise<void> {
  if (!store.user) return;
  await apiFetch('/api/v1/auth/biometric', {
    method: 'POST',
    body: { action: 'toggle', enabled: !store.user.biometric_enabled },
  });
  await store.fetchSession();
}

async function handleLogout(): Promise<void> {
  await store.logout();
  await router.push('/login');
}

async function submitKyc(): Promise<void> {
  kycError.value = '';
  kycSuccess.value = '';
  try {
    await apiFetch('/api/v1/kyc', {
      method: 'POST',
      body: {
        nik: kycForm.nik.trim(),
        full_name_ktp: kycForm.fullName.trim(),
        ktp_image_url: kycForm.ktpUrl.trim(),
        selfie_image_url: kycForm.selfieUrl.trim(),
        liveness_passed: kycForm.liveness,
      },
    });
    kycSuccess.value =
      'Pengajuan KYC berhasil dikirim! Menunggu persetujuan admin di halaman Admin & Konfigurasi.';
    await loadProfile();
  } catch (err) {
    kycError.value = err instanceof Error ? err.message : 'Pengajuan KYC gagal.';
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-bold tracking-tight">Profil &amp; Pengaturan</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Status akun, keamanan perangkat &amp; biometrik, dan verifikasi e-KTP Saku Plus
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Beranda</RouterLink>
    </div>

    <div v-if="store.user" class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <!-- Kolom Kiri: Identitas, Status Finansial, Keamanan, Navigasi Saku -->
      <div class="lg:col-span-5 space-y-5">
        <section class="sk-card space-y-4">
          <div class="flex items-center gap-3.5">
            <span class="w-14 h-14 rounded-full bg-[var(--primary)] text-white text-lg font-bold flex items-center justify-center shrink-0">
              {{ getInitials(store.user.full_name) }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-[18px] font-bold truncate">{{ store.user.full_name }}</h2>
                <span class="sk-pill" :class="store.user.kyc_status === 'VERIFIED' ? 'sk-pill-pos' : 'sk-pill-warn'">
                  <AppIcon v-if="store.user.kyc_status === 'VERIFIED'" name="verified" size-class="w-3.5 h-3.5" />
                  {{ store.user.kyc_status === 'VERIFIED' ? 'Saku Plus' : store.user.kyc_status }}
                </span>
              </div>
              <p class="font-mono-id text-xs text-[var(--muted)] mt-0.5">{{ store.user.phone_number }}</p>
            </div>
          </div>

          <!-- Status Finansial & Limit Akun (real data) -->
          <div class="grid grid-cols-2 gap-3 pt-2">
            <div class="p-3.5 rounded-[14px] bg-[var(--container-low)] border border-[var(--border)]">
              <p class="text-[11px] font-semibold text-[var(--muted)]">Saldo Aktif</p>
              <p class="mt-1 text-base font-bold num text-[var(--primary)]">
                {{ formatRupiah(store.walletSummary?.total_balance ?? 0) }}
              </p>
            </div>
            <div class="p-3.5 rounded-[14px] bg-[var(--container-low)] border border-[var(--border)]">
              <p class="text-[11px] font-semibold text-[var(--muted)]">Limit Akun</p>
              <p class="mt-1 text-base font-bold num text-[var(--text)]">
                {{ formatRupiah(balanceLimit) }}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <RouterLink to="/qris?tab=my-qr" class="sk-btn">
              <AppIcon name="qr-request" />
              <span>QR Saya</span>
            </RouterLink>
            <RouterLink to="/pockets" class="sk-btn">
              <AppIcon name="wallet" />
              <span>Kantong Nabung</span>
            </RouterLink>
          </div>
        </section>

        <!-- Keamanan & Privasi -->
        <section class="sk-card space-y-4">
          <h3 class="text-[15px] font-bold">Keamanan &amp; Privasi</h3>

          <div class="flex items-center justify-between gap-3 py-1">
            <div>
              <p class="text-sm font-semibold">Otorisasi Biometrik Cepat</p>
              <p class="text-xs text-[var(--muted)]">Tampilkan tombol biometrik di dialog konfirmasi PIN</p>
            </div>
            <button
              type="button"
              class="sk-btn min-h-[38px] px-3.5 text-xs"
              :class="store.user.biometric_enabled ? 'sk-btn-primary' : ''"
              @click="toggleBiometric"
            >
              {{ store.user.biometric_enabled ? 'Aktif' : 'Nonaktif' }}
            </button>
          </div>

          <div class="flex items-center justify-between gap-3 py-2 border-t border-[var(--rule)]">
            <div>
              <p class="text-sm font-semibold">Perangkat Terhubung</p>
              <p class="font-mono-id text-xs text-[var(--muted)]">
                {{ store.user.device_id || 'WEB-BROWSER-PRIMARY' }}
              </p>
            </div>
            <span class="sk-pill sk-pill-pos">Aktif</span>
          </div>

          <div class="p-4 rounded-[14px] border border-[var(--border)] bg-[var(--container-low)] flex items-center gap-4">
            <div class="bg-white p-2 rounded-[10px] border border-[var(--border)] shrink-0">
              <QrCodeBox :value="`SAKUKILAT:USER:${store.user.phone_number}`" :size="96" alt="QR Profil Saku" />
            </div>
            <div class="min-w-0">
              <p class="text-xs font-bold text-[var(--text)]">QR Terima Transfer P2P</p>
              <p class="text-[11px] font-mono-id text-[var(--muted)] break-all mt-0.5">
                SAKUKILAT:USER:{{ store.user.phone_number }}
              </p>
            </div>
          </div>
        </section>

        <!-- Akses Fitur Tambahan & Keluar -->
        <section class="sk-card space-y-2.5">
          <h3 class="text-[15px] font-bold mb-1">Layanan &amp; Pengelolaan Sesi</h3>

          <RouterLink
            to="/merchant"
            class="flex items-center justify-between min-h-[44px] px-3 rounded-[12px] bg-[var(--container-low)] hover:bg-[var(--container)] text-sm font-semibold"
          >
            <span class="flex items-center gap-2.5">
              <AppIcon name="store" class="text-[var(--primary)]" />
              <span>Saku Bisnis (Kasir Merchant)</span>
            </span>
            <AppIcon name="chevron-right" />
          </RouterLink>

          <RouterLink
            to="/admin"
            class="flex items-center justify-between min-h-[44px] px-3 rounded-[12px] bg-[var(--container-low)] hover:bg-[var(--container)] text-sm font-semibold"
          >
            <span class="flex items-center gap-2.5">
              <AppIcon name="shield" class="text-[var(--primary)]" />
              <span>Admin &amp; Konfigurasi Aplikasi</span>
            </span>
            <AppIcon name="chevron-right" />
          </RouterLink>

          <div class="pt-2 grid grid-cols-2 gap-2.5">
            <RouterLink to="/login" class="sk-btn">Ganti Akun</RouterLink>
            <button type="button" class="sk-btn text-[var(--negative)]" @click="handleLogout">
              <AppIcon name="logout" />
              <span>Keluar</span>
            </button>
          </div>
        </section>
      </div>

      <!-- Kolom Kanan: Verifikasi Identitas e-KTP -->
      <section class="sk-card lg:col-span-7 space-y-4">
        <div>
          <h2 class="text-[17px] font-bold">Verifikasi Identitas e-KTP (Upgrade Saku Plus)</h2>
          <p class="text-xs text-[var(--muted)] mt-0.5">
            NIK dienkripsi AES-256-CBC di basis data dan membuka limit Rp 20.000.000 serta transfer BI-FAST.
          </p>
        </div>

        <div v-if="latestKyc" class="p-3.5 rounded-[14px] border border-[var(--border)] bg-[var(--container-low)] space-y-1 text-sm">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold">Pengajuan KYC Terakhir: {{ latestKyc.full_name_ktp }}</span>
            <span
              class="sk-pill"
              :class="latestKyc.status === 'VERIFIED' ? 'sk-pill-pos' : latestKyc.status === 'PENDING' ? 'sk-pill-warn' : 'sk-pill-neg'"
            >
              {{ latestKyc.status }}
            </span>
          </div>
          <p v-if="latestKyc.rejection_reason" class="text-xs text-[var(--negative)]">
            Alasan ditolak: {{ latestKyc.rejection_reason }}
          </p>
        </div>

        <div v-if="loading" class="text-xs text-[var(--muted)]">Memeriksa status KYC akun...</div>

        <div
          v-if="store.user.kyc_status === 'VERIFIED'"
          class="p-4 rounded-[14px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm font-medium"
        >
          Akun Anda sudah berstatus <strong>Saku Plus</strong>. Limit saldo aktif
          <strong>Rp 20.000.000</strong> serta akses penuh transfer rekening <strong>BI-FAST</strong> telah aktif.
        </div>

        <template v-else>
          <FeatureDisabledNotice
            :enabled="store.canUse('allow_kyc_submission')"
            feature-name="Pengajuan Verifikasi e-KTP (KYC)"
          />
          <div v-if="kycError" class="p-3 rounded-[12px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
            {{ kycError }}
          </div>
          <div v-if="kycSuccess" class="p-3 rounded-[12px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm">
            {{ kycSuccess }}
          </div>

          <form class="space-y-4" @submit.prevent="submitKyc">
            <div>
              <label for="kyc-nik" class="block text-xs font-semibold text-[var(--muted)] mb-1">
                Nomor Induk Kependudukan (16 Digit NIK)
              </label>
              <input id="kyc-nik" v-model="kycForm.nik" type="text" inputmode="numeric" maxlength="16" required class="sk-input font-mono-id" />
            </div>
            <div>
              <label for="kyc-name" class="block text-xs font-semibold text-[var(--muted)] mb-1">
                Nama Lengkap Sesuai e-KTP
              </label>
              <input id="kyc-name" v-model="kycForm.fullName" type="text" required class="sk-input" />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="kyc-ktp-url" class="block text-xs font-semibold text-[var(--muted)] mb-1">Referensi Foto e-KTP</label>
                <input id="kyc-ktp-url" v-model="kycForm.ktpUrl" type="text" required class="sk-input font-mono-id text-xs" />
              </div>
              <div>
                <label for="kyc-selfie-url" class="block text-xs font-semibold text-[var(--muted)] mb-1">Referensi Selfie Liveness</label>
                <input id="kyc-selfie-url" v-model="kycForm.selfieUrl" type="text" required class="sk-input font-mono-id text-xs" />
              </div>
            </div>
            <label class="p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--container-low)] flex items-center gap-2.5 text-sm cursor-pointer">
              <input v-model="kycForm.liveness" type="checkbox" required class="accent-[var(--primary)]" />
              <span>Saya menyatakan data e-KTP asli dan lolos pemeriksaan wajah.</span>
            </label>
            <button type="submit" :disabled="!store.canUse('allow_kyc_submission')" class="w-full sk-btn sk-btn-primary">
              Ajukan Verifikasi e-KTP
            </button>
          </form>
        </template>
      </section>
    </div>
  </div>
</template>
