<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import CashflowBarChart from '@/components/analytics/CashflowBarChart.vue';
import { useSessionStore } from '@/stores/session';
import type { AnalyticsSummary, TransactionRecord } from '@/types/sakukilat';
import { apiFetch } from '@/utils/api';
import { formatDateTimeWib, formatRupiah, signedRupiah } from '@/utils/format';

const store = useSessionStore();
const transactions = ref<TransactionRecord[]>([]);
const analytics = ref<AnalyticsSummary | null>(null);

const filters = reactive({
  q: '',
  direction: 'ALL',
  type: 'ALL',
});

const csvHref = computed(() => {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.direction !== 'ALL') params.set('direction', filters.direction);
  if (filters.type !== 'ALL') params.set('type', filters.type);
  const qs = params.toString();
  return `/api/v1/transactions/export.csv${qs ? `?${qs}` : ''}`;
});

async function loadHistory(): Promise<void> {
  if (!store.user) return;
  const params = new URLSearchParams({ limit: '50' });
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.direction !== 'ALL') params.set('direction', filters.direction);
  if (filters.type !== 'ALL') params.set('type', filters.type);

  const [txRes, sumRes] = await Promise.all([
    apiFetch<{ transactions: TransactionRecord[] }>(`/api/v1/transactions?${params.toString()}`),
    apiFetch<AnalyticsSummary>('/api/v1/analytics/summary'),
  ]);
  transactions.value = txRes.transactions;
  analytics.value = sumRes;
}

watch(() => store.user?.id, () => void loadHistory(), { immediate: true });
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Riwayat &amp; Laporan Keuangan</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Arus kas 7 hari terakhir, komposisi pengeluaran, dan unduhan mutasi CSV
        </p>
      </div>
      <div class="flex items-center gap-2">
        <a :href="csvHref" class="sk-btn">Unduh CSV</a>
        <RouterLink to="/" class="sk-btn">Beranda</RouterLink>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
      <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Total Pemasukan</p>
        <p class="mt-1 text-2xl font-semibold num text-[var(--positive)]">
          +{{ formatRupiah(analytics?.total_in) }}
        </p>
      </div>
      <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Total Pengeluaran</p>
        <p class="mt-1 text-2xl font-semibold num">{{ formatRupiah(analytics?.total_out) }}</p>
      </div>
      <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">
          Selisih Bersih ({{ analytics?.transaction_count ?? 0 }} transaksi)
        </p>
        <p
          class="mt-1 text-2xl font-semibold num"
          :class="(analytics?.net_flow ?? 0) >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'"
        >
          {{ (analytics?.net_flow ?? 0) >= 0 ? '+' : '-' }}{{ formatRupiah(Math.abs(analytics?.net_flow ?? 0)) }}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start mb-5">
      <CashflowBarChart :series="analytics?.daily_series ?? []" />

      <section class="sk-card lg:col-span-5 flex flex-col justify-between">
        <div>
          <h2 class="text-[16px] font-semibold">Komposisi Pengeluaran</h2>
          <p class="text-xs text-[var(--muted)]">Distribusi berdasarkan kategori transaksi</p>

          <div v-if="analytics?.categories?.length" class="mt-4 space-y-3">
            <div v-for="cat in analytics.categories" :key="cat.category">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-medium">{{ cat.category }}</span>
                <span class="num font-semibold">{{ formatRupiah(cat.amount) }} ({{ cat.share_percent }}%)</span>
              </div>
              <div class="h-2 rounded-full bg-[var(--ground)] overflow-hidden">
                <div
                  class="h-full rounded-full bg-[var(--accent)]"
                  :style="{ width: `${Math.min(100, cat.share_percent)}%` }"
                />
              </div>
            </div>
          </div>
          <p v-else class="py-10 text-center text-sm text-[var(--muted)]">Belum ada pengeluaran tercatat.</p>
        </div>

        <p class="mt-4 pt-3 border-t border-[var(--rule)] text-xs text-[var(--muted)]">
          Semua nominal dihitung langsung dari buku besar atomik (double-entry).
        </p>
      </section>
    </div>

    <section class="sk-card space-y-4">
      <form class="grid grid-cols-1 sm:grid-cols-12 gap-3" @submit.prevent="loadHistory">
        <div class="sm:col-span-5">
          <input
            v-model="filters.q"
            type="text"
            placeholder="Cari nama merchant, keterangan, atau nomor referensi..."
            class="sk-input text-sm"
          />
        </div>
        <div class="sm:col-span-3">
          <select v-model="filters.direction" class="sk-input text-sm">
            <option value="ALL">Semua Arus Kas</option>
            <option value="IN">Uang Masuk (IN)</option>
            <option value="OUT">Uang Keluar (OUT)</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <select v-model="filters.type" class="sk-input text-sm">
            <option value="ALL">Semua Jenis</option>
            <option
              v-for="t in ['TOPUP', 'QRIS', 'TRANSFER_P2P', 'TRANSFER_BANK', 'PPOB', 'SPLIT_BILL', 'POCKET_MOVE', 'MERCHANT_SETTLE']"
              :key="t"
              :value="t"
            >
              {{ t }}
            </option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <button type="submit" class="sk-btn sk-btn-primary w-full">Filter</button>
        </div>
      </form>

      <div class="hidden md:block overflow-x-auto">
        <table class="sk-table">
          <thead>
            <tr>
              <th>Transaksi</th>
              <th>Referensi</th>
              <th>Kategori</th>
              <th>Status</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="tx in transactions"
              :key="tx.id"
              class="hover:bg-[var(--raised)] cursor-pointer"
              @click="store.openReceipt(tx)"
            >
              <td>
                <p class="font-medium text-[var(--text)]">{{ tx.title }}</p>
                <p class="text-xs text-[var(--faint)]">{{ formatDateTimeWib(tx.created_at) }} WIB</p>
              </td>
              <td class="font-mono-id text-xs text-[var(--muted)]">{{ tx.reference_number }}</td>
              <td><span class="sk-pill sk-pill-neutral">{{ tx.category }}</span></td>
              <td>
                <span
                  class="sk-pill"
                  :class="tx.status === 'SUCCESS' ? 'sk-pill-pos' : tx.status === 'REVERSED' ? 'sk-pill-warn' : 'sk-pill-neg'"
                >
                  {{ tx.status }}
                </span>
              </td>
              <td class="num font-semibold" :class="tx.direction === 'IN' ? 'text-[var(--positive)]' : 'text-[var(--text)]'">
                {{ signedRupiah(tx.total_amount, tx.direction) }}
              </td>
            </tr>
            <tr v-if="!transactions.length">
              <td colspan="5" class="py-10 text-center text-sm text-[var(--muted)]">
                Tidak ada transaksi yang cocok dengan filter Anda.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="md:hidden divide-y divide-[var(--rule)]">
        <button
          v-for="tx in transactions"
          :key="tx.id"
          type="button"
          class="w-full py-3 flex items-center justify-between gap-3 text-left"
          @click="store.openReceipt(tx)"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">{{ tx.title }}</p>
            <p class="text-xs text-[var(--faint)] truncate">{{ tx.category }} • {{ formatDateTimeWib(tx.created_at) }}</p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-sm font-semibold num" :class="tx.direction === 'IN' ? 'text-[var(--positive)]' : 'text-[var(--text)]'">
              {{ signedRupiah(tx.total_amount, tx.direction) }}
            </p>
            <p class="text-[11px] font-mono-id text-[var(--faint)]">{{ tx.status }}</p>
          </div>
        </button>
        <p v-if="!transactions.length" class="py-8 text-center text-sm text-[var(--muted)]">
          Belum ada transaksi.
        </p>
      </div>
    </section>
  </div>
</template>

