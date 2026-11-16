<script setup lang="ts">
import { reactive, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import QrCodeBox from '@/components/common/QrCodeBox.vue';
import { useSessionStore } from '@/stores/session';
import { apiFetch } from '@/utils/api';
import { formatRupiah } from '@/utils/format';

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

const kycForm = reactive({
  nik: '',
  fullName: '',
  ktpUrl: 'sandbox://kyc/ktp-front-demo.jpg',
  selfieUrl: 'sandbox://kyc/selfie-liveness-demo.jpg',
  liveness: true,
});

async function loadProfile(): Promise<void> {
  if (!store.user) return;
  const me = await apiFetch<{ balance_limit: number; latest_kyc: KycDoc | null }>('/api/v1/auth/me');
  balanceLimit.value = me.balance_limit;
  latestKyc.value = me.latest_kyc;
  kycForm.fullName = store.user.full_name;
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
  await router.push('/auth');
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
      'Pengajuan KYC berhasil dikirim! Menunggu persetujuan Compliance Admin di halaman Admin & Ledger.';
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
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">
          Profil, Keamanan &amp; Verifikasi e-KTP
        </h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Kelola perangkat terikat, biometrik transaksi, dan upgrade SakuKilat Plus (Rp 20 juta)
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Beranda</RouterLink>
    </div>

    <div v-if="store.user" class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="sk-card lg:col-span-5 space-y-5">
        <div>
          <h2 class="text-lg font-semibold">{{ store.user.full_name }}</h2>
          <p class="font-mono-id text-xs text-[var(--muted)] mt-0.5">{{ store.user.phone_number }}</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span class="sk-pill" :class="store.user.kyc_status === 'VERIFIED' ? 'sk-pill-pos' : 'sk-pill-warn'">
              {{ store.user.kyc_status === 'VERIFIED' ? 'SakuKilat Plus' : store.user.kyc_status }}
            </span>
            <span class="sk-pill sk-pill-neutral">Limit {{ formatRupiah(balanceLimit) }}</span>
          </div>
        </div>

        <div class="p-4 rounded-[14px] border border-[var(--border)] bg-[var(--ground)] flex flex-col items-center text-center">
          <div class="bg-white p-2.5 rounded-[10px] border border-[var(--border)]">
            <QrCodeBox :value="`SAKUKILAT:USER:${store.user.phone_number}`" :size="156" alt="QR Profil SakuKilat" />
          </div>
          <p class="text-xs font-medium mt-2.5">QR Terima Transfer P2P (Rp 0)</p>
          <p class="text-[11px] font-mono-id text-[var(--faint)] mt-0.5">
            SAKUKILAT:USER:{{ store.user.phone_number }}
          </p>
        </div>

        <div class="space-y-3 pt-2 border-t border-[var(--rule)]">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium">Perangkat Terikat (Device Binding)</p>
              <p class="font-mono-id text-xs text-[var(--muted)]">
                {{ store.user.device_id || 'WEB-BROWSER-PRIMARY' }}
              </p>
            </div>
            <span class="sk-pill sk-pill-pos">Aktif</span>
          </div>

          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium">Otorisasi Biometrik Cepat</p>
              <p class="text-xs text-[var(--muted)]">Aktifkan tombol biometrik pada modal konfirmasi PIN</p>
            </div>
            <button
              type="button"
              class="sk-btn min-h-[34px] px-3 text-xs"
              :class="store.user.biometric_enabled ? 'sk-btn-primary' : ''"
              @click="toggleBiometric"
            >
              {{ store.user.biometric_enabled ? 'Aktif' : 'Nonaktif' }}
            </button>
          </div>
        </div>

        <div class="pt-3 border-t border-[var(--rule)] flex flex-wrap gap-2.5">
          <RouterLink to="/auth" class="sk-btn flex-1">Halaman Login / OTP</RouterLink>
          <button type="button" class="flex-1 sk-btn text-[var(--negative)]" @click="handleLogout">
            Keluar Sesi
          </button>
        </div>
      </section>

      <section class="sk-card lg:col-span-7 space-y-4">
        <div>
          <h2 class="text-[16px] font-semibold">Verifikasi Identitas e-KTP (Upgrade SakuKilat Plus)</h2>
          <p class="text-xs text-[var(--muted)] mt-0.5">
            NIK dienkripsi AES-256-CBC saat disimpan dan tidak pernah ditayangkan ulang secara utuh.
          </p>
        </div>

        <div v-if="latestKyc" class="p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--ground)] space-y-1 text-sm">
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium">Pengajuan KYC Terakhir: {{ latestKyc.full_name_ktp }}</span>
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

        <div
          v-if="store.user.kyc_status === 'VERIFIED'"
          class="p-4 rounded-[12px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm"
        >
          Akun Anda sudah terverifikasi <strong>SakuKilat Plus</strong>. Anda menikmati limit saldo
          <strong>Rp 20.000.000</strong> serta fitur transfer bank <strong>BI-FAST</strong>.
        </div>

        <template v-else>
          <div v-if="kycError" class="p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
            {{ kycError }}
          </div>
          <div v-if="kycSuccess" class="p-3 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm">
            {{ kycSuccess }}
          </div>

          <form class="space-y-4" @submit.prevent="submitKyc">
            <div>
              <label for="kyc-nik" class="block text-xs font-medium text-[var(--muted)] mb-1">
                Nomor Induk Kependudukan (16 Digit NIK)
              </label>
              <input id="kyc-nik" v-model="kycForm.nik" type="text" inputmode="numeric" maxlength="16" required class="sk-input font-mono-id" />
            </div>
            <div>
              <label for="kyc-name" class="block text-xs font-medium text-[var(--muted)] mb-1">
                Nama Lengkap Sesuai e-KTP
              </label>
              <input id="kyc-name" v-model="kycForm.fullName" type="text" required class="sk-input" />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="kyc-ktp-url" class="block text-xs font-medium text-[var(--muted)] mb-1">Referensi Foto e-KTP</label>
                <input id="kyc-ktp-url" v-model="kycForm.ktpUrl" type="text" required class="sk-input font-mono-id text-xs" />
              </div>
              <div>
                <label for="kyc-selfie-url" class="block text-xs font-medium text-[var(--muted)] mb-1">Referensi Selfie Liveness</label>
                <input id="kyc-selfie-url" v-model="kycForm.selfieUrl" type="text" required class="sk-input font-mono-id text-xs" />
              </div>
            </div>
            <label class="p-3 rounded-[10px] border border-[var(--border)] bg-[var(--ground)] flex items-center gap-2.5 text-sm cursor-pointer">
              <input v-model="kycForm.liveness" type="checkbox" required class="accent-[var(--accent)]" />
              <span>Saya menyatakan foto e-KTP asli &amp; pemeriksaan liveness wajah lulus.</span>
            </label>
            <button type="submit" class="w-full sk-btn sk-btn-primary">Ajukan Verifikasi e-KTP</button>
          </form>
        </template>
      </section>
    </div>
  </div>
</template>

