<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import BalanceCard from '@/components/dashboard/BalanceCard.vue';
import PocketsSummaryCard from '@/components/dashboard/PocketsSummaryCard.vue';
import QuickServicesCard from '@/components/dashboard/QuickServicesCard.vue';
import RecentTransactionsCard from '@/components/dashboard/RecentTransactionsCard.vue';
import { useSessionStore } from '@/stores/session';
import type { TransactionRecord } from '@/types/sakukilat';
import { apiFetch } from '@/utils/api';

const store = useSessionStore();
const recentTransactions = ref<TransactionRecord[]>([]);
const monthlyOutflow = shallowRef(0);
const loading = shallowRef(true);
const loadError = shallowRef('');

const firstName = computed(() => {
  const full = store.user?.full_name?.trim() || 'Pengguna';
  return full.split(' ')[0] || full;
});

async function loadHome(): Promise<void> {
  if (!store.user) {
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    await store.fetchWallets();
    const [txRes, analyticsRes] = await Promise.all([
      apiFetch<{ transactions: TransactionRecord[] }>('/api/v1/transactions?limit=4'),
      apiFetch<{ total_out: number }>('/api/v1/analytics/summary'),
    ]);
    recentTransactions.value = txRes.transactions;
    monthlyOutflow.value = Number(analyticsRes.total_out ?? 0);
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Gagal memuat ringkasan beranda.';
  } finally {
    loading.value = false;
  }
}

watch(() => store.user?.id, () => void loadHome(), { immediate: true });
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-bold tracking-tight leading-tight">
          Halo, {{ firstName }}
        </h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Ringkasan saldo aktif, layanan cepat, dan aktivitas dompet Anda
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="store.user?.kyc_status === 'VERIFIED'" class="sk-pill sk-pill-pos">
          Saku Plus (Maks Rp 20 jt)
        </span>
        <RouterLink v-else to="/profil" class="sk-pill sk-pill-warn hover:opacity-90">
          Akun Basic (Maks Rp 2 jt): Verifikasi e-KTP
        </RouterLink>
      </div>
    </div>

    <div
      v-if="loadError"
      class="mb-5 p-4 rounded-[16px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] flex flex-wrap items-center justify-between gap-3"
    >
      <span class="text-sm font-medium">{{ loadError }}</span>
      <button type="button" class="sk-btn" @click="loadHome">Muat Ulang</button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      <BalanceCard
        :summary="store.walletSummary"
        :kyc-verified="store.user?.kyc_status === 'VERIFIED'"
        :loading="loading"
      />
      <QuickServicesCard
        :bifast-quota="store.walletSummary?.bifast_quota"
        :monthly-outflow="monthlyOutflow"
      />
    </div>

    <div class="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      <PocketsSummaryCard :pockets="store.walletSummary?.pockets ?? []" :loading="loading" />
      <RecentTransactionsCard
        :transactions="recentTransactions"
        :loading="loading"
        @select="(tx) => store.openReceipt(tx)"
      />
    </div>
  </div>
</template>
