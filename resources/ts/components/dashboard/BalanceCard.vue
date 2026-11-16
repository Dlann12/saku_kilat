<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { useBalancePrivacy } from '@/composables/useBalancePrivacy';
import type { WalletSummary } from '@/types/sakukilat';
import { formatRupiah } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    summary: WalletSummary | null;
    kycVerified?: boolean;
    loading?: boolean;
  }>(),
  { kycVerified: false, loading: false }
);

const { hidden, toggle, maskAmount } = useBalancePrivacy();

const totalBal = computed(() => Number(props.summary?.total_balance ?? 0));
const mainBal = computed(() => Number(props.summary?.main_balance ?? 0));
const pocketsBal = computed(() => Number(props.summary?.pockets_total ?? 0));
const limitBal = computed(() => Number(props.summary?.balance_limit ?? 2_000_000));
const capPct = computed(() =>
  limitBal.value > 0 ? Math.min(100, Math.round((totalBal.value / limitBal.value) * 100)) : 0
);

const quickActions = [
  { label: 'Kirim', icon: 'send', to: '/transfer' },
  { label: 'Minta QR', icon: 'qr-request', to: '/qris?tab=my-qr' },
  { label: 'Top Up', icon: 'plus', to: '/topup' },
  { label: 'Kantong', icon: 'wallet', to: '/pockets' },
];
</script>

<template>
  <section class="lg:col-span-7 flex flex-col justify-between gap-3.5 h-full" aria-label="Saldo aktif dan aksi utama">
    <!-- Emerald Hero Balance Card -->
    <div class="sk-hero-emerald relative overflow-hidden !p-4 sm:!p-6">
      <div class="relative flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-white/95">Saldo Aktif</span>
          <button
            type="button"
            class="min-w-[40px] min-h-[40px] -my-2 rounded-full flex items-center justify-center text-white/90 hover:bg-white/15 transition-colors"
            :aria-pressed="hidden"
            aria-label="Sembunyikan atau tampilkan saldo"
            @click="toggle"
          >
            <AppIcon :name="hidden ? 'eye-off' : 'eye'" size-class="w-4 h-4" />
          </button>
        </div>

        <RouterLink
          to="/profil"
          class="min-h-[30px] px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
        >
          <AppIcon name="verified" size-class="w-3.5 h-3.5" />
          <span>{{ kycVerified ? 'Saku Plus' : 'Akun Basic' }}</span>
        </RouterLink>
      </div>

      <p class="relative mt-2 text-[28px] sm:text-[36px] font-bold tracking-tight leading-[1.12] num">
        {{ loading && !summary ? 'Memuat saldo...' : maskAmount(totalBal) }}
      </p>

      <div class="relative mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/90">
        <span>
          Saku Utama:
          <strong class="font-semibold text-white num">{{ maskAmount(mainBal) }}</strong>
        </span>
        <span>
          Kantong Nabung:
          <strong class="font-semibold text-white num">{{ maskAmount(pocketsBal) }}</strong>
        </span>
      </div>

      <div class="relative mt-3.5 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
        <span class="text-[13px] font-medium text-white/95">
          Kapasitas akun {{ capPct }}% (maks {{ formatRupiah(limitBal) }})
        </span>
        <RouterLink
          to="/topup"
          class="min-h-[40px] px-4 py-1.5 rounded-full bg-white text-[var(--primary)] font-bold text-sm inline-flex items-center gap-1.5 hover:bg-[var(--accent-soft)] transition-colors"
        >
          <AppIcon name="plus" size-class="w-4 h-4" />
          <span>Isi Saldo</span>
        </RouterLink>
      </div>
    </div>

    <!-- 4 Quick Action Buttons (clean icon + label, no nested icon-chip wrapper) -->
    <div class="grid grid-cols-4 gap-2.5">
      <RouterLink
        v-for="item in quickActions"
        :key="item.label"
        :to="item.to"
        class="flex flex-col items-center justify-center gap-1.5 min-h-[72px] p-2.5 rounded-[12px] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--container-low)] transition-colors"
      >
        <AppIcon :name="item.icon" size-class="w-5 h-5 text-[var(--primary)]" />
        <span class="text-[13px] font-semibold text-[var(--text)]">{{ item.label }}</span>
      </RouterLink>
    </div>

    <!-- Account Limit Meter -->
    <div class="sk-card !py-3.5 !px-4 mt-auto">
      <div class="flex justify-between text-[13px] text-[var(--muted)] mb-2">
        <span class="font-medium text-[var(--variant)]">Batas Saldo Akun</span>
        <span class="num font-semibold text-[var(--text)]">{{ capPct }}% dari {{ formatRupiah(limitBal) }}</span>
      </div>
      <div class="h-2 w-full rounded-full bg-[var(--container)] overflow-hidden">
        <div class="h-full rounded-full bg-[var(--primary)]" :style="{ width: `${capPct}%` }" />
      </div>
    </div>
  </section>
</template>
