<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { useBalancePrivacy } from '@/composables/useBalancePrivacy';
import type { WalletSummary } from '@/types/sakukilat';
import { formatRupiah } from '@/utils/format';

const props = defineProps<{
  summary: WalletSummary | null;
}>();

const { hidden, toggle, maskAmount } = useBalancePrivacy();

const totalBal = computed(() => Number(props.summary?.total_balance ?? 0));
const mainBal = computed(() => Number(props.summary?.main_balance ?? 0));
const pocketsBal = computed(() => Number(props.summary?.pockets_total ?? 0));
const limitBal = computed(() => Number(props.summary?.balance_limit ?? 2_000_000));
const capPct = computed(() =>
  limitBal.value > 0 ? Math.min(100, Math.round((totalBal.value / limitBal.value) * 100)) : 0
);
</script>

<template>
  <section class="sk-card lg:col-span-7 flex flex-col justify-between" aria-label="Total saldo SakuKilat">
    <div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm font-medium text-[var(--muted)]">Total Saldo SakuKilat</span>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] px-2.5 py-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)]"
          :aria-pressed="hidden"
          aria-label="Sembunyikan atau tampilkan nominal saldo"
          @click="toggle"
        >
          <AppIcon name="eye" size-class="w-3.5 h-3.5" />
          <span>{{ hidden ? 'Tampilkan' : 'Sembunyikan' }}</span>
        </button>
      </div>

      <p class="mt-2 text-[32px] sm:text-[38px] font-semibold tracking-tight leading-[1.15] num">
        {{ maskAmount(totalBal) }}
      </p>

      <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
        <span>
          Dompet Utama:
          <strong class="font-semibold text-[var(--text)] num">{{ maskAmount(mainBal) }}</strong>
        </span>
        <span>
          Kantong Pintar:
          <strong class="font-semibold text-[var(--text)] num">{{ maskAmount(pocketsBal) }}</strong>
        </span>
      </div>

      <div class="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <RouterLink to="/topup" class="sk-btn sk-btn-primary">
          <AppIcon name="plus" />
          <span>Top Up</span>
        </RouterLink>
        <RouterLink to="/transfer" class="sk-btn">
          <AppIcon name="transfer" />
          <span>Transfer</span>
        </RouterLink>
        <RouterLink to="/pockets" class="sk-btn">
          <AppIcon name="wallet" />
          <span>Pindah</span>
        </RouterLink>
        <RouterLink to="/qris" class="sk-btn">
          <AppIcon name="qris" />
          <span>Bayar QRIS</span>
        </RouterLink>
      </div>
    </div>

    <div class="mt-4 pt-3 border-t border-[var(--rule)]">
      <div class="flex items-center justify-between text-xs text-[var(--muted)] mb-1.5">
        <span>Kapasitas Saldo Akun ({{ capPct }}%)</span>
        <span class="num">Maks {{ formatRupiah(limitBal) }}</span>
      </div>
      <div class="h-1.5 w-full rounded-full bg-[var(--ground)] overflow-hidden">
        <div class="h-full rounded-full bg-[var(--accent)]" :style="{ width: `${capPct}%` }" />
      </div>
    </div>
  </section>
</template>

