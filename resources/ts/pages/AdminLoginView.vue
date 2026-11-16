<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';
import { useSessionStore } from '@/stores/session';
import { apiFetch } from '@/utils/api';

const router = useRouter();
const store = useSessionStore();
const errorMsg = shallowRef('');
const loading = shallowRef(false);

const adminPersonas = computed(() => store.demoPersonas.filter((p) => p.role === 'ADMIN'));

const adminForm = reactive({
  identifier: 'compliance@sakukilat.id',
  pin: '123456',
  workstationId: 'AUDIT-STATION-01',
});

async function handleAdminLogin(): Promise<void> {
  errorMsg.value = '';
  loading.value = true;
  try {
    await apiFetch('/api/v1/auth/admin/login', {
      method: 'POST',
      body: {
        identifier: adminForm.identifier.trim(),
        pin: adminForm.pin.trim(),
        device_id: adminForm.workstationId.trim() || 'AUDIT-STATION-01',
      },
    });
    await store.fetchSession();
    await router.push('/admin');
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Otentikasi admin gagal.';
  } finally {
    loading.value = false;
  }
}

async function quickAdminLogin(userId: string): Promise<void> {
  await store.switchDemoPersona(userId);
  await router.push('/admin');
}
</script>

<template>
  <div class="min-h-screen bg-[var(--ground)] text-[var(--text)] px-4 py-8">
    <div class="max-w-[920px] mx-auto">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-[9px] bg-[var(--primary)] text-white flex items-center justify-center shrink-0">
            <AppIcon name="shield" size-class="w-5 h-5" />
          </div>
          <div>
            <h1 class="text-xl font-semibold tracking-tight leading-tight">Portal Login Admin Kepatuhan</h1>
            <p class="text-xs text-[var(--muted)]">Akses Khusus Compliance Officer, Audit Ledger &amp; KYC Review</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <RouterLink to="/login" class="sk-btn">Login Pengguna</RouterLink>
          <RouterLink v-if="store.user" to="/" class="sk-btn">Beranda</RouterLink>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <section class="sk-card lg:col-span-7 flex flex-col justify-between gap-5">
          <div class="space-y-5">
            <div class="flex items-center justify-between gap-2 pb-3 border-b border-[var(--rule)]">
              <div>
                <h2 class="text-[16px] font-semibold">Otentikasi Administrator Internal</h2>
                <p class="text-[13px] text-[var(--muted)] mt-0.5">
                  Hanya akun dengan peran ADMIN yang dapat mengakses konsol ini
                </p>
              </div>
              <span class="sk-pill sk-pill-neutral">Restricted</span>
            </div>

            <div
              v-if="errorMsg"
              class="p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"
            >
              {{ errorMsg }}
            </div>

            <form class="space-y-4" @submit.prevent="handleAdminLogin">
              <div>
                <label for="admin-identifier" class="block text-[13px] font-medium text-[var(--muted)] mb-1.5">
                  Email Resmi atau Nomor HP Admin
                </label>
                <input
                  id="admin-identifier"
                  v-model="adminForm.identifier"
                  type="text"
                  placeholder="compliance@sakukilat.id atau +6281100009999"
                  required
                  class="sk-input font-mono-id text-sm"
                />
              </div>

              <div>
                <label for="admin-pin" class="block text-[13px] font-medium text-[var(--muted)] mb-1.5">
                  PIN Keamanan Admin 6-Digit
                </label>
                <input
                  id="admin-pin"
                  v-model="adminForm.pin"
                  type="password"
                  inputmode="numeric"
                  maxlength="6"
                  required
                  class="sk-input num tracking-[0.25em]"
                />
                <p class="mt-1 text-[13px] text-[var(--faint)]">
                  PIN bawaan admin demo: <span class="font-mono-id">123456</span>
                </p>
              </div>

              <div>
                <label for="admin-workstation" class="block text-[13px] font-medium text-[var(--muted)] mb-1.5">
                  ID Workstation Audit
                </label>
                <input
                  id="admin-workstation"
                  v-model="adminForm.workstationId"
                  type="text"
                  class="sk-input font-mono-id text-[13px]"
                />
              </div>

              <button type="submit" :disabled="loading" class="w-full sk-btn sk-btn-dark">
                {{ loading ? 'Memverifikasi Kredensial...' : 'Masuk ke Konsol Admin & Ledger' }}
              </button>
            </form>
          </div>

          <p class="pt-3 border-t border-[var(--rule)] text-[13px] text-[var(--muted)]">
            Pendaftaran admin baru hanya dilakukan internal; pengguna dompet umum silakan masuk melalui halaman Login Pengguna.
          </p>
        </section>

        <aside class="sk-card lg:col-span-5 flex flex-col justify-between gap-4">
          <div class="space-y-4">
            <div>
              <h2 class="text-[16px] font-semibold">Akun Compliance Admin Tersedia</h2>
              <p class="text-[13px] text-[var(--muted)] mt-1">
                Masuk instan untuk meninjau KYC, membuktikan saldo Double-Entry, dan menjalankan Auto-Reversal.
              </p>
            </div>

            <div class="space-y-2.5">
              <div
                v-for="admin in adminPersonas"
                :key="admin.id"
                class="p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--ground)] space-y-2.5"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ admin.full_name }}</p>
                    <p class="font-mono-id text-[13px] text-[var(--muted)] mt-0.5">{{ admin.email || admin.phone_number }}</p>
                    <p class="font-mono-id text-xs text-[var(--faint)]">{{ admin.phone_number }}</p>
                  </div>
                  <span class="sk-pill sk-pill-pos">ADMIN</span>
                </div>
                <button
                  type="button"
                  class="w-full sk-btn min-h-[36px] text-[13px]"
                  @click="quickAdminLogin(admin.id)"
                >
                  Masuk Cepat sebagai {{ admin.full_name }}
                </button>
              </div>
            </div>
          </div>

          <div class="p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-1.5 text-[13px] text-[var(--muted)]">
            <p class="font-semibold text-[var(--text)]">Hak Akses Konsol Compliance:</p>
            <p>• Persetujuan / Penolakan antrean KYC e-KTP</p>
            <p>• Audit keseimbangan Debit = Kredit secara real-time</p>
            <p>• Eksekusi Auto-Reversal transaksi atomik</p>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

