<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import CashflowBarChart from '@/components/analytics/CashflowBarChart.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { useSessionStore } from '@/stores/session';
import type { AnalyticsSummary, TransactionRecord } from '@/types/sakukilat';
import { apiFetch, getAuthToken, resolveApiUrl } from '@/utils/api';
import { formatDateTimeWib, formatRupiah, signedRupiah } from '@/utils/format';

const store = useSessionStore();
const transactions = ref<TransactionRecord[]>([]);
const analytics = ref<AnalyticsSummary | null>(null);
const loading = shallowRef(true);
const loadError = shallowRef('');

const filters = reactive({
  q: '',
  direction: 'ALL',
  type: 'ALL',
});

const typePills = [
  { key: 'ALL', label: 'Semua' },
  { key: 'TRANSFER_P2P', label: 'Transfer P2P' },
  { key: 'TRANSFER_BANK', label: 'Transfer Bank' },
  { key: 'QRIS', label: 'QRIS' },
  { key: 'PPOB', label: 'Tagihan PPOB' },
  { key: 'TOPUP', label: 'Top Up' },
  { key: 'SPLIT_BILL', label: 'Patungan' },
  { key: 'POCKET_MOVE', label: 'Kantong' },
];

const csvHref = computed(() => {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.direction !== 'ALL') params.set('direction', filters.direction);
  if (filters.type !== 'ALL') params.set('type', filters.type);
  const qs = params.toString();
  return `/api/v1/transactions/export.csv${qs ? `?${qs}` : ''}`;
});

async function loadHistory(): Promise<void> {
  if (!store.user) {
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
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
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Gagal memuat riwayat transaksi.';
  } finally {
    loading.value = false;
  }
}

watch(() => store.user?.id, () => void loadHistory(), { immediate: true });

function selectType(typeKey: string): void {
  filters.type = typeKey;
  void loadHistory();
}

function selectDirection(dir: string): void {
  filters.direction = dir;
  void loadHistory();
}

async function downloadCsv(): Promise<void> {
  const target = resolveApiUrl(csvHref.value);
  const token = getAuthToken();
  if (!token && !resolveApiUrl('/').startsWith('http')) {
    window.location.href = target;
    return;
  }
  const res = await fetch(target, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mutasi-sakukilat.csv';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-bold tracking-tight">Riwayat Transaksi</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Ringkasan arus kas masuk-keluar, distribusi harian, dan ekspor mutasi CSV
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="sk-btn sk-btn-primary" @click="downloadCsv">
          <AppIcon name="download" />
          <span>Unduh CSV</span>
        </button>
        <RouterLink to="/" class="sk-btn">Beranda</RouterLink>
      </div>
    </div>

    <div
      v-if="loadError"
      class="mb-5 p-4 rounded-[16px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] flex flex-wrap items-center justify-between gap-3"
    >
      <span class="text-sm font-medium">{{ loadError }}</span>
      <button type="button" class="sk-btn" @click="loadHistory">Muat Ulang</button>
    </div>

    <!-- Cashflow Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
      <div class="sk-card flex items-center gap-3.5">
        <span class="w-11 h-11 rounded-[14px] bg-[var(--pill-positive-bg)] text-[var(--primary)] flex items-center justify-center shrink-0">
          <AppIcon name="arrow-down" size-class="w-5 h-5" />
        </span>
        <div>
          <p class="text-xs font-semibold text-[var(--muted)]">Pemasukan</p>
          <p class="mt-0.5 text-[22px] font-bold num text-[var(--positive)]">
            +{{ formatRupiah(analytics?.total_in) }}
          </p>
        </div>
      </div>

      <div class="sk-card flex items-center gap-3.5">
        <span class="w-11 h-11 rounded-[14px] bg-[var(--container-low)] text-[var(--text)] flex items-center justify-center shrink-0">
          <AppIcon name="arrow-up" size-class="w-5 h-5" />
        </span>
        <div>
          <p class="text-xs font-semibold text-[var(--muted)]">Pengeluaran</p>
          <p class="mt-0.5 text-[22px] font-bold num text-[var(--text)]">
            {{ formatRupiah(analytics?.total_out) }}
          </p>
        </div>
      </div>

      <div class="sk-card">
        <p class="text-xs font-semibold text-[var(--muted)]">
          Arus Kas Bersih ({{ analytics?.transaction_count ?? 0 }} transaksi)
        </p>
        <p
          class="mt-1 text-[22px] font-bold num"
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
          <h2 class="text-[16px] font-bold">Komposisi Pengeluaran</h2>
          <p class="text-xs text-[var(--muted)]">Persentase per kategori transaksi sukses</p>

          <div v-if="analytics?.categories?.length" class="mt-4 space-y-3">
            <div v-for="cat in analytics.categories" :key="cat.category">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-semibold">{{ cat.category }}</span>
                <span class="num font-bold">{{ formatRupiah(cat.amount) }} ({{ cat.share_percent }}%)</span>
              </div>
              <div class="h-2 rounded-full bg-[var(--container)] overflow-hidden">
                <div
                  class="h-full rounded-full bg-[var(--primary)]"
                  :style="{ width: `${Math.min(100, cat.share_percent)}%` }"
                />
              </div>
            </div>
          </div>
          <p v-else class="py-10 text-center text-sm text-[var(--muted)]">Belum ada pengeluaran tercatat.</p>
        </div>

        <p class="mt-4 pt-3 border-t border-[var(--rule)] text-xs text-[var(--muted)]">
          Semua nominal dihitung langsung dari jurnal double-entry SakuKilat.
        </p>
      </section>
    </div>

    <section class="sk-card space-y-4">
      <form class="flex flex-col sm:flex-row gap-2.5" @submit.prevent="loadHistory">
        <div class="relative flex-1">
          <input
            v-model="filters.q"
            type="text"
            placeholder="Cari nama merchant, keterangan, atau nomor referensi..."
            class="sk-input text-sm"
          />
        </div>
        <select
          :value="filters.direction"
          aria-label="Filter arah arus kas"
          class="sk-input text-sm sm:w-44"
          @change="selectDirection(($event.target as HTMLSelectElement).value)"
        >
          <option value="ALL">Semua Arus Kas</option>
          <option value="IN">Pemasukan (IN)</option>
          <option value="OUT">Pengeluaran (OUT)</option>
        </select>
        <button type="submit" class="sk-btn sk-btn-primary shrink-0">Cari</button>
      </form>

      <!-- Horizontal Category Pills matching mockup 04 -->
      <div class="sk-scroll-x gap-2 pb-1">
        <button
          v-for="pill in typePills"
          :key="pill.key"
          type="button"
          class="min-h-[38px] px-3.5 rounded-full text-xs font-semibold border transition-colors shrink-0"
          :class="
            filters.type === pill.key
              ? 'bg-[var(--primary)] text-white border-transparent'
              : 'bg-[var(--container-low)] text-[var(--variant)] border-[var(--border)] hover:bg-[var(--container)]'
          "
          @click="selectType(pill.key)"
        >
          {{ pill.label }}
        </button>
      </div>

      <div v-if="loading && !transactions.length" class="py-10 text-center text-sm text-[var(--muted)]">
        Memuat daftar mutasi transaksi...
      </div>

      <template v-else>
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
                class="hover:bg-[var(--container-low)] cursor-pointer"
                @click="store.openReceipt(tx)"
              >
                <td>
                  <p class="font-semibold text-[var(--text)]">{{ tx.title }}</p>
                  <p class="text-xs text-[var(--muted)]">{{ formatDateTimeWib(tx.created_at) }} WIB</p>
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
                <td class="num font-bold" :class="tx.direction === 'IN' ? 'text-[var(--positive)]' : 'text-[var(--text)]'">
                  {{ signedRupiah(tx.total_amount, tx.direction) }}
                </td>
              </tr>
              <tr v-if="!transactions.length">
                <td colspan="5" class="py-10 text-center text-sm text-[var(--muted)]">
                  Tidak ada transaksi yang cocok dengan filter Anda. Ubah kata kunci atau kategori di atas.
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
            class="w-full py-3.5 flex items-center justify-between gap-3 text-left"
            @click="store.openReceipt(tx)"
          >
            <div class="min-w-0">
              <p class="text-sm font-semibold truncate text-[var(--text)]">{{ tx.title }}</p>
              <p class="text-xs text-[var(--muted)] truncate">
                {{ tx.category }} • {{ formatDateTimeWib(tx.created_at) }} WIB
              </p>
            </div>
            <div class="text-right shrink-0">
              <p class="text-sm font-bold num" :class="tx.direction === 'IN' ? 'text-[var(--positive)]' : 'text-[var(--text)]'">
                {{ signedRupiah(tx.total_amount, tx.direction) }}
              </p>
              <p class="text-[11px] font-semibold text-[var(--muted)]">{{ tx.status }}</p>
            </div>
          </button>
          <p v-if="!transactions.length" class="py-10 text-center text-sm text-[var(--muted)]">
            Tidak ada transaksi yang cocok dengan filter Anda.
          </p>
        </div>
      </template>
    </section>
  </div>
</template>
