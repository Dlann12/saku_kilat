<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BalanceCard from '@/components/dashboard/BalanceCard.vue';
import PocketsSummaryCard from '@/components/dashboard/PocketsSummaryCard.vue';
import QuickServicesCard from '@/components/dashboard/QuickServicesCard.vue';
import RecentTransactionsCard from '@/components/dashboard/RecentTransactionsCard.vue';
import { useSessionStore } from '@/stores/session';
import type { TransactionRecord } from '@/types/sakukilat';
import { apiFetch } from '@/utils/api';

const store = useSessionStore();
const recentTransactions = ref<TransactionRecord[]>([]);

const firstName = computed(() => {
  const full = store.user?.full_name?.trim() || 'Pengguna';
  return full.split(' ')[0] || full;
});

async function loadHome(): Promise<void> {
  if (!store.user) return;
  await store.fetchWallets();
  const txRes = await apiFetch<{ transactions: TransactionRecord[] }>('/api/v1/transactions?limit=4');
  recentTransactions.value = txRes.transactions;
}

watch(() => store.user?.id, () => void loadHome(), { immediate: true });
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-tight">
          Selamat datang, {{ firstName }}
        </h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Ringkasan saldo, Kantong Pintar, dan transaksi terbaru Anda
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="store.user?.kyc_status === 'VERIFIED'" class="sk-pill sk-pill-pos">
          SakuKilat Plus (Maks Rp 20 jt)
        </span>
        <RouterLink v-else to="/profil" class="sk-pill sk-pill-warn hover:opacity-90">
          Akun Basic (Maks Rp 2 jt) — Verifikasi e-KTP
        </RouterLink>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      <BalanceCard :summary="store.walletSummary" />
      <QuickServicesCard :bifast-quota="store.walletSummary?.bifast_quota" />
    </div>

    <div class="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      <PocketsSummaryCard :pockets="store.walletSummary?.pockets ?? []" />
      <RecentTransactionsCard
        :transactions="recentTransactions"
        @select="(tx) => store.openReceipt(tx)"
      />
    </div>
  </div>
</template>

