<script setup lang="ts">
import { onUnmounted, reactive, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import { useSessionStore } from '@/stores/session';
import { apiFetch } from '@/utils/api';

const router = useRouter();
const store = useSessionStore();

const mode = shallowRef<'login' | 'register'>('login');
const errorMsg = shallowRef('');
const infoMsg = shallowRef('');
const countdown = shallowRef(0);
let timerId: ReturnType<typeof setInterval> | null = null;

const loginForm = reactive({
  phone: '+6285211223344',
  pin: '123456',
  deviceId: 'WEB-BROWSER-PRIMARY',
});

const regForm = reactive({
  phone: '',
  channel: 'WHATSAPP' as 'WHATSAPP' | 'SMS',
  otp: '',
  registrationToken: '',
  fullName: '',
  email: '',
  pin: '',
});

onUnmounted(() => {
  if (timerId) clearInterval(timerId);
});

async function handleLogin(): Promise<void> {
  errorMsg.value = '';
  infoMsg.value = '';
  try {
    await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: {
        phone_number: loginForm.phone.trim(),
        pin: loginForm.pin.trim(),
        device_id: loginForm.deviceId.trim() || 'WEB-BROWSER-PRIMARY',
      },
    });
    await store.fetchSession();
    await router.push('/');
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Login gagal.';
  }
}

async function requestOtp(): Promise<void> {
  errorMsg.value = '';
  infoMsg.value = '';
  try {
    const res = await apiFetch<{ channel: string; ttl_seconds: number; sandbox_otp_preview?: string }>(
      '/api/v1/auth/otp/request',
      {
        method: 'POST',
        body: {
          phone_number: regForm.phone.trim(),
          channel: regForm.channel,
        },
      }
    );
    const preview = res.sandbox_otp_preview ? ` Kode OTP Sandbox: ${res.sandbox_otp_preview}` : '';
    infoMsg.value = `Kode OTP dikirim via ${res.channel}.${preview}`;
    countdown.value = Number(res.ttl_seconds || 180);
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      countdown.value = Math.max(0, countdown.value - 1);
      if (countdown.value === 0 && timerId) clearInterval(timerId);
    }, 1000);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal mengirim OTP.';
  }
}

async function verifyOtp(): Promise<void> {
  errorMsg.value = '';
  infoMsg.value = '';
  try {
    const res = await apiFetch<{ registration_token?: string }>('/api/v1/auth/otp/verify', {
      method: 'POST',
      body: {
        phone_number: regForm.phone.trim(),
        otp_code: regForm.otp.trim(),
        purpose: 'REGISTER',
      },
    });
    if (res.registration_token) {
      regForm.registrationToken = res.registration_token;
      infoMsg.value = 'OTP terverifikasi. Silakan isi nama lengkap dan buat PIN 6-digit.';
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Verifikasi OTP gagal.';
  }
}

async function completeRegistration(): Promise<void> {
  errorMsg.value = '';
  try {
    await apiFetch('/api/v1/auth/register', {
      method: 'POST',
      body: {
        phone_number: regForm.phone.trim(),
        full_name: regForm.fullName.trim(),
        email: regForm.email.trim() || null,
        pin: regForm.pin.trim(),
        registration_token: regForm.registrationToken,
        device_id: 'WEB-BROWSER-PRIMARY',
      },
    });
    await store.fetchSession();
    await router.push('/');
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Pendaftaran gagal.';
  }
}

async function useDemoPersona(userId: string): Promise<void> {
  await store.switchDemoPersona(userId);
  await router.push('/');
}
</script>

<template>
  <div class="min-h-screen bg-[var(--ground)] text-[var(--text)] px-4 py-8">
    <div class="max-w-[920px] mx-auto">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div class="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="#1D5FD6" />
            <path
              d="M17.5 6.5L10 17.5H16L14.5 25.5L22 14.5H16L17.5 6.5Z"
              fill="#FFFFFF"
              stroke="#FFFFFF"
              stroke-width="1"
              stroke-linejoin="round"
            />
          </svg>
          <div>
            <h1 class="text-xl font-semibold tracking-tight leading-tight">SakuKilat</h1>
            <p class="text-xs text-[var(--muted)]">Transaksi Cepat, Kelola Uang Tanpa Ribet</p>
          </div>
        </div>
        <RouterLink to="/" class="sk-btn">Kembali ke Beranda</RouterLink>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <section class="sk-card lg:col-span-7">
          <div class="flex gap-2 p-1 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] mb-5">
            <button
              type="button"
              class="flex-1 h-9 rounded-[9px] text-sm font-medium"
              :class="
                mode === 'login'
                  ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'
                  : 'text-[var(--muted)]'
              "
              @click="mode = 'login'"
            >
              Masuk (PIN)
            </button>
            <button
              type="button"
              class="flex-1 h-9 rounded-[9px] text-sm font-medium"
              :class="
                mode === 'register'
                  ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'
                  : 'text-[var(--muted)]'
              "
              @click="mode = 'register'"
            >
              Daftar Akun Baru (OTP)
            </button>
          </div>

          <div
            v-if="errorMsg"
            class="mb-4 p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"
          >
            {{ errorMsg }}
          </div>
          <div
            v-if="infoMsg"
            class="mb-4 p-3 rounded-[10px] bg-[var(--pill-accent-bg)] text-[var(--accent-ink)] text-sm"
          >
            {{ infoMsg }}
          </div>

          <form v-if="mode === 'login'" class="space-y-4" @submit.prevent="handleLogin">
            <div>
              <label for="login-phone" class="block text-xs font-medium text-[var(--muted)] mb-1.5">
                Nomor HP Terdaftar
              </label>
              <input id="login-phone" v-model="loginForm.phone" type="tel" required class="sk-input" />
            </div>
            <div>
              <label for="login-pin" class="block text-xs font-medium text-[var(--muted)] mb-1.5">
                PIN Keamanan 6-Digit
              </label>
              <input
                id="login-pin"
                v-model="loginForm.pin"
                type="password"
                inputmode="numeric"
                maxlength="6"
                required
                class="sk-input num tracking-[0.25em]"
              />
              <p class="mt-1 text-xs text-[var(--faint)]">
                PIN bawaan semua akun demo adalah <span class="font-mono-id">123456</span>
              </p>
            </div>
            <div>
              <label for="login-device" class="block text-xs font-medium text-[var(--muted)] mb-1.5">
                ID Perangkat (Device Binding)
              </label>
              <input id="login-device" v-model="loginForm.deviceId" type="text" class="sk-input font-mono-id text-xs" />
            </div>
            <button type="submit" class="w-full sk-btn sk-btn-primary">Masuk ke SakuKilat</button>
          </form>

          <div v-else class="space-y-5">
            <form class="space-y-3 pb-4 border-b border-[var(--rule)]" @submit.prevent="requestOtp">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-[var(--accent)]">
                  Langkah 1 — Kirim Kode OTP
                </span>
                <span v-if="countdown > 0" class="text-xs text-[var(--muted)] num">
                  Sisa waktu: {{ countdown }}d
                </span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div class="sm:col-span-2">
                  <input v-model="regForm.phone" type="tel" placeholder="+6285299887766" required class="sk-input" />
                </div>
                <select v-model="regForm.channel" class="sk-input text-sm">
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="SMS">SMS</option>
                </select>
              </div>
              <button type="submit" class="sk-btn w-full sm:w-auto">Kirim OTP (Berlaku 180 Detik)</button>
            </form>

            <form class="space-y-3 pb-4 border-b border-[var(--rule)]" @submit.prevent="verifyOtp">
              <span class="block text-xs font-semibold text-[var(--accent)]">
                Langkah 2 — Verifikasi Kode 6-Digit
              </span>
              <div class="flex flex-col sm:flex-row gap-2.5">
                <input
                  v-model="regForm.otp"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="Masukkan 6 digit OTP"
                  required
                  class="sk-input font-mono-id tracking-widest"
                />
                <button type="submit" class="sk-btn sk-btn-dark shrink-0">Verifikasi OTP</button>
              </div>
              <p class="text-xs text-[var(--faint)]">
                3x salah memasukkan OTP akan mengunci sementara selama 15 menit (anti brute-force).
              </p>
            </form>

            <form class="space-y-3" @submit.prevent="completeRegistration">
              <span class="block text-xs font-semibold text-[var(--accent)]">
                Langkah 3 — Profil &amp; Buat PIN
              </span>
              <div>
                <label for="reg-name" class="block text-xs font-medium text-[var(--muted)] mb-1">Nama Lengkap</label>
                <input id="reg-name" v-model="regForm.fullName" type="text" required class="sk-input" />
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="reg-email" class="block text-xs font-medium text-[var(--muted)] mb-1">Email (Opsional)</label>
                  <input id="reg-email" v-model="regForm.email" type="email" class="sk-input" />
                </div>
                <div>
                  <label for="reg-pin" class="block text-xs font-medium text-[var(--muted)] mb-1">Buat PIN 6-Digit</label>
                  <input
                    id="reg-pin"
                    v-model="regForm.pin"
                    type="password"
                    inputmode="numeric"
                    maxlength="6"
                    required
                    class="sk-input num tracking-[0.25em]"
                  />
                </div>
              </div>
              <button
                type="submit"
                :disabled="!regForm.registrationToken"
                class="w-full sk-btn sk-btn-primary"
              >
                Selesaikan Pendaftaran &amp; Buka Dompet
              </button>
            </form>
          </div>
        </section>

        <aside class="sk-card lg:col-span-5">
          <h2 class="text-[16px] font-semibold">Akun Simulasi Cepat (Demo Persona)</h2>
          <p class="text-xs text-[var(--muted)] mt-1">
            Pilih salah satu akun terisi saldo &amp; riwayat untuk menguji peran pengguna, merchant UMKM, maupun admin kepatuhan.
          </p>

          <div class="mt-4 space-y-2.5">
            <div
              v-for="p in store.demoPersonas"
              :key="p.id"
              class="p-3 rounded-[12px] border border-[var(--border)] bg-[var(--ground)] flex items-center justify-between gap-3"
            >
              <div class="min-w-0">
                <p class="text-sm font-semibold truncate">{{ p.full_name }}</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="font-mono-id text-xs text-[var(--muted)]">{{ p.phone_number }}</span>
                  <span class="sk-pill" :class="p.kyc_status === 'VERIFIED' ? 'sk-pill-pos' : 'sk-pill-warn'">
                    {{ p.kyc_status === 'VERIFIED' ? 'KYC Verified' : 'Basic' }}
                  </span>
                </div>
              </div>
              <button type="button" class="sk-btn shrink-0 text-xs px-3 min-h-[34px]" @click="useDemoPersona(p.id)">
                Pakai Akun
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
