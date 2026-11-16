<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue';
import MoneyInput from '@/components/common/MoneyInput.vue';
import type { AppConfig, AppPermissions } from '@/types/sakukilat';
import { apiFetch } from '@/utils/api';

const props = defineProps<{
  config: AppConfig;
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  saved: [nextConfig: AppConfig];
}>();

const saving = shallowRef(false);
const errorMsg = shallowRef('');
const savedBanner = shallowRef(false);

const permissionOptions: Array<{ key: keyof AppPermissions; label: string; desc: string }> = [
  { key: 'allow_topup', label: 'Top Up Saldo', desc: 'Izinkan isi ulang lewat VA, Gerai Ritel, dan Debit.' },
  { key: 'allow_qris', label: 'Scan & Bayar QRIS', desc: 'Izinkan pembayaran QRIS statis dan dinamis.' },
  { key: 'allow_p2p_transfer', label: 'Transfer Sesama (P2P)', desc: 'Izinkan transfer antar pengguna SakuKilat.' },
  { key: 'allow_bank_transfer', label: 'Transfer Bank (BI-FAST)', desc: 'Izinkan transfer keluar ke rekening bank.' },
  { key: 'allow_ppob', label: 'Tagihan & PPOB', desc: 'Izinkan pembelian pulsa, data, token PLN, PDAM, BPJS.' },
  { key: 'allow_split_bill', label: 'Patungan (Split Bill)', desc: 'Izinkan pembuatan dan pembayaran tagihan patungan.' },
  { key: 'allow_pockets', label: 'Kantong Pintar', desc: 'Izinkan buat kantong baru dan pindah saldo internal.' },
  { key: 'allow_kyc_submission', label: 'Pengajuan KYC e-KTP', desc: 'Izinkan pengguna mengajukan upgrade SakuKilat Plus.' },
];

const draft = reactive<AppConfig>({
  permissions: { ...props.config.permissions },
  limits: { ...props.config.limits },
});

watch(
  () => props.config,
  (val) => {
    Object.assign(draft.permissions, val.permissions);
    Object.assign(draft.limits, val.limits);
  },
  { deep: true }
);

function toggleAll(enabled: boolean): void {
  for (const opt of permissionOptions) {
    draft.permissions[opt.key] = enabled;
  }
}

async function saveConfig(): Promise<void> {
  if (!props.isAdmin) return;
  saving.value = true;
  errorMsg.value = '';
  savedBanner.value = false;
  try {
    const updated = await apiFetch<AppConfig>('/api/v1/admin/config', {
      method: 'PUT',
      body: {
        permissions: draft.permissions,
        limits: draft.limits,
      },
    });
    savedBanner.value = true;
    emit('saved', updated);
    setTimeout(() => {
      savedBanner.value = false;
    }, 3000);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi aplikasi.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="sk-card space-y-5 mb-5" aria-label="Konfigurasi Aplikasi & Hak Akses Pengguna">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-[16px] font-semibold">Konfigurasi Aplikasi &amp; Izin Fitur Pengguna</h2>
        <p class="text-[13px] text-[var(--muted)] mt-0.5">
          Atur fitur apa saja yang boleh diakses pengguna serta batas saldo &amp; kuota transfer secara dinamis
        </p>
      </div>
      <div v-if="isAdmin" class="flex gap-2">
        <button type="button" class="sk-btn min-h-[34px] px-3 text-xs" @click="toggleAll(true)">
          Aktifkan Semua
        </button>
        <button type="button" class="sk-btn min-h-[34px] px-3 text-xs" @click="toggleAll(false)">
          Nonaktifkan Semua
        </button>
      </div>
    </div>

    <div
      v-if="errorMsg"
      class="p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"
    >
      {{ errorMsg }}
    </div>
    <div
      v-if="savedBanner"
      class="p-3 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm"
    >
      Konfigurasi aplikasi berhasil disimpan dan langsung berlaku bagi seluruh pengguna.
    </div>

    <form class="space-y-5" @submit.prevent="saveConfig">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label
          v-for="opt in permissionOptions"
          :key="opt.key"
          class="p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--ground)] flex items-start justify-between gap-3 cursor-pointer"
          :class="{ 'opacity-65 cursor-not-allowed': !isAdmin }"
        >
          <div class="min-w-0">
            <p class="text-sm font-semibold leading-snug">{{ opt.label }}</p>
            <p class="text-xs text-[var(--muted)] mt-1 leading-relaxed">{{ opt.desc }}</p>
          </div>
          <input
            v-model="draft.permissions[opt.key]"
            type="checkbox"
            :disabled="!isAdmin"
            class="mt-0.5 w-4 h-4 shrink-0 accent-[var(--accent)]"
          />
        </label>
      </div>

      <div class="pt-4 border-t border-[var(--rule)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label for="cfg-limit-basic" class="block text-xs font-medium text-[var(--muted)] mb-1">
            Limit Saldo Basic
          </label>
          <MoneyInput
            id="cfg-limit-basic"
            v-model="draft.limits.unverified_balance_limit"
            :min="100000"
            :max="50000000"
            :step="100000"
            :readonly="!isAdmin"
          />
        </div>
        <div>
          <label for="cfg-limit-plus" class="block text-xs font-medium text-[var(--muted)] mb-1">
            Limit Saldo SakuKilat Plus
          </label>
          <MoneyInput
            id="cfg-limit-plus"
            v-model="draft.limits.verified_balance_limit"
            :min="500000"
            :max="100000000"
            :step="500000"
            :readonly="!isAdmin"
          />
        </div>
        <div>
          <label for="cfg-bifast-quota" class="block text-xs font-medium text-[var(--muted)] mb-1">
            Kuota BI-FAST Gratis / Bulan
          </label>
          <input
            id="cfg-bifast-quota"
            v-model.number="draft.limits.bifast_monthly_free_quota"
            type="number"
            min="0"
            max="100"
            :readonly="!isAdmin"
            class="sk-input h-11 num font-semibold"
          />
        </div>
        <div>
          <label for="cfg-bifast-fee" class="block text-xs font-medium text-[var(--muted)] mb-1">
            Biaya BI-FAST Setelah Kuota
          </label>
          <MoneyInput
            id="cfg-bifast-fee"
            v-model="draft.limits.bifast_fee_after_quota"
            :min="0"
            :max="25000"
            :step="500"
            :readonly="!isAdmin"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-[var(--muted)]">
          {{
            isAdmin
              ? 'Perubahan tercatat otomatis ke Outbox Event audit.'
              : 'Masuk sebagai akun Admin untuk mengubah konfigurasi ini.'
          }}
        </p>
        <button type="submit" :disabled="!isAdmin || saving" class="sk-btn sk-btn-primary">
          {{ saving ? 'Menyimpan...' : 'Simpan Konfigurasi Aplikasi' }}
        </button>
      </div>
    </form>
  </section>
</template>

