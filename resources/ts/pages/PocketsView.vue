<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import FeatureDisabledNotice from '@/components/common/FeatureDisabledNotice.vue';
import MoneyInput from '@/components/common/MoneyInput.vue';
import { useSessionStore } from '@/stores/session';
import type { TransactionRecord, Wallet } from '@/types/sakukilat';
import { apiFetch, makeIdempotencyKey } from '@/utils/api';
import { formatRupiah, pocketColors } from '@/utils/format';

const store = useSessionStore();
const moveError = shallowRef('');
const createError = shallowRef('');

const usableWallets = computed(() =>
  (store.walletSummary?.wallets ?? []).filter((w) => ['MAIN', 'POCKET'].includes(w.wallet_type))
);

const moveForm = reactive({
  sourceWalletId: '',
  destinationWalletId: '',
  amount: 50000,
});

const createForm = reactive({
  name: '',
  categoryKey: 'savings',
  targetAmount: 1000000,
});

function syncWalletSelections(): void {
  const list = usableWallets.value;
  if (!list.length) return;
  if (!list.some((w) => w.id === moveForm.sourceWalletId)) {
    moveForm.sourceWalletId = list[0].id;
  }
  if (!list.some((w) => w.id === moveForm.destinationWalletId)) {
    moveForm.destinationWalletId = (list[1] ?? list[0]).id;
  }
}

async function loadPockets(): Promise<void> {
  if (!store.user) return;
  await store.fetchWallets();
  syncWalletSelections();
}

watch(() => store.user?.id, () => void loadPockets(), { immediate: true });

function progressPercent(p: Wallet): number {
  const bal = Number(p.balance ?? 0);
  const target = Number(p.target_amount ?? 0);
  return target > 0 ? Math.min(100, Math.round((bal / target) * 100)) : 0;
}

async function toggleLock(pocket: Wallet): Promise<void> {
  await apiFetch(`/api/v1/wallets/pockets/${pocket.id}`, {
    method: 'PATCH',
    body: { is_locked: !pocket.is_locked },
  });
  await loadPockets();
}

async function moveBalance(): Promise<void> {
  moveError.value = '';
  try {
    const tx = await apiFetch<TransactionRecord>('/api/v1/wallets/move', {
      method: 'POST',
      idempotencyKey: makeIdempotencyKey('move'),
      body: {
        source_wallet_id: moveForm.sourceWalletId,
        destination_wallet_id: moveForm.destinationWalletId,
        amount: moveForm.amount,
      },
    });
    await loadPockets();
    store.openReceipt(tx);
  } catch (err) {
    moveError.value = err instanceof Error ? err.message : 'Gagal memindahkan saldo.';
  }
}

async function createPocket(): Promise<void> {
  createError.value = '';
  try {
    await apiFetch('/api/v1/wallets/pockets', {
      method: 'POST',
      body: {
        name: createForm.name.trim(),
        category_key: createForm.categoryKey,
        target_amount: createForm.targetAmount >= 10000 ? createForm.targetAmount : null,
      },
    });
    createForm.name = '';
    await loadPockets();
  } catch (err) {
    createError.value = err instanceof Error ? err.message : 'Gagal membuat kantong.';
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Kantong Pintar (Smart Pockets)</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Pisahkan pos belanja, kunci tabungan, dan pindahkan saldo internal Rp 0
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Kembali</RouterLink>
    </div>

    <FeatureDisabledNotice :enabled="store.canUse('allow_pockets')" feature-name="Kantong Pintar (Buat & Pindah Saldo)" />

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
      <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Total Semua Dompet</p>
        <p class="mt-1 text-2xl font-semibold num">{{ formatRupiah(store.walletSummary?.total_balance) }}</p>
      </div>
      <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Dompet Utama</p>
        <p class="mt-1 text-2xl font-semibold num">{{ formatRupiah(store.walletSummary?.main_balance) }}</p>
      </div>
      <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Total di Kantong Pintar</p>
        <p class="mt-1 text-2xl font-semibold num text-[var(--accent)]">
          {{ formatRupiah(store.walletSummary?.pockets_total) }}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="lg:col-span-7 space-y-4">
        <div v-if="store.walletSummary?.main_wallet" class="sk-card">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-semibold">{{ store.walletSummary.main_wallet.name }}</h2>
                <span class="sk-pill sk-pill-accent">Utama</span>
              </div>
              <p class="text-xs text-[var(--muted)] mt-1">
                Sumber dana default untuk Top Up, Transfer, dan transaksi umum
              </p>
            </div>
            <p class="text-xl font-semibold num">{{ formatRupiah(store.walletSummary.main_wallet.balance) }}</p>
          </div>
        </div>

        <div v-for="pocket in store.walletSummary?.pockets ?? []" :key="pocket.id" class="sk-card space-y-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-base font-semibold">{{ pocket.name }}</h3>
                <span
                  class="sk-pill"
                  :style="{
                    background: pocketColors(pocket.category_key).bg,
                    color: pocketColors(pocket.category_key).ink,
                  }"
                >
                  {{ pocketColors(pocket.category_key).label }}
                </span>
                <span v-if="pocket.is_locked" class="sk-pill sk-pill-neg">Terkunci</span>
              </div>
              <p class="text-xs text-[var(--muted)] mt-1">
                {{
                  pocket.is_locked
                    ? 'Saldo dilindungi — tidak bisa dipakai debit sebelum dibuka.'
                    : 'Siap digunakan sebagai sumber dana QRIS, Transfer, atau PPOB.'
                }}
              </p>
            </div>
            <p class="text-xl font-semibold num">{{ formatRupiah(pocket.balance) }}</p>
          </div>

          <div v-if="Number(pocket.target_amount ?? 0) > 0">
            <div class="flex justify-between text-xs text-[var(--muted)] mb-1">
              <span>Progres Target</span>
              <span class="num">
                {{ formatRupiah(pocket.balance) }} / {{ formatRupiah(pocket.target_amount) }} ({{ progressPercent(pocket) }}%)
              </span>
            </div>
            <div class="h-2 w-full rounded-full bg-[var(--ground)] overflow-hidden">
              <div class="h-full rounded-full bg-[var(--accent)]" :style="{ width: `${progressPercent(pocket)}%` }" />
            </div>
          </div>

          <div class="pt-2 border-t border-[var(--rule)] flex flex-wrap items-center justify-between gap-2">
            <span class="font-mono-id text-xs text-[var(--faint)]">ID: {{ pocket.id.slice(0, 8) }}</span>
            <button type="button" class="sk-btn min-h-[34px] px-3 text-xs" @click="toggleLock(pocket)">
              <AppIcon name="lock" size-class="w-3.5 h-3.5" />
              <span>{{ pocket.is_locked ? 'Buka Kunci Kantong' : 'Kunci Kantong' }}</span>
            </button>
          </div>
        </div>
      </section>

      <aside class="lg:col-span-5 space-y-5">
        <div class="sk-card space-y-4">
          <div>
            <h2 class="text-[16px] font-semibold">Pindah Saldo Internal (Rp 0)</h2>
            <p class="text-xs text-[var(--muted)]">
              Pindah instan antara Dompet Utama dan Kantong Pintar tanpa biaya admin
            </p>
          </div>

          <form class="space-y-3" @submit.prevent="moveBalance">
            <div>
              <label for="move-from" class="block text-xs font-medium text-[var(--muted)] mb-1">Dari Dompet</label>
              <select id="move-from" v-model="moveForm.sourceWalletId" class="sk-input text-sm">
                <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                  {{ w.name }} ({{ formatRupiah(w.balance) }})
                </option>
              </select>
            </div>
            <div>
              <label for="move-to" class="block text-xs font-medium text-[var(--muted)] mb-1">Ke Dompet Tujuan</label>
              <select id="move-to" v-model="moveForm.destinationWalletId" class="sk-input text-sm">
                <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                  {{ w.name }} ({{ formatRupiah(w.balance) }})
                </option>
              </select>
            </div>
            <div>
              <label for="move-amount" class="block text-xs font-medium text-[var(--muted)] mb-1">Nominal Pindah</label>
              <MoneyInput id="move-amount" v-model="moveForm.amount" />
            </div>
            <div v-if="moveError" class="p-2.5 rounded-[8px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-xs">
              {{ moveError }}
            </div>
            <button type="submit" :disabled="!store.canUse('allow_pockets')" class="w-full sk-btn sk-btn-primary">
              Pindahkan Sekarang
            </button>
          </form>
        </div>

        <div class="sk-card space-y-4">
          <div>
            <h2 class="text-[16px] font-semibold">Buat Kantong Pintar Baru</h2>
            <p class="text-xs text-[var(--muted)]">Buat pos anggaran khusus agar pengeluaran lebih terkontrol</p>
          </div>

          <form class="space-y-3" @submit.prevent="createPocket">
            <div>
              <label for="pocket-name" class="block text-xs font-medium text-[var(--muted)] mb-1">Nama Kantong</label>
              <input id="pocket-name" v-model="createForm.name" type="text" placeholder="Contoh: Dana Darurat" required class="sk-input text-sm" />
            </div>
            <div>
              <label for="pocket-category" class="block text-xs font-medium text-[var(--muted)] mb-1">Kategori</label>
              <select id="pocket-category" v-model="createForm.categoryKey" class="sk-input text-sm">
                <option value="savings">Tabungan / Dana Darurat</option>
                <option value="food">Konsumsi &amp; Harian</option>
                <option value="transport">Transportasi</option>
                <option value="bills">Tagihan Rutin</option>
              </select>
            </div>
            <div>
              <label for="pocket-target" class="block text-xs font-medium text-[var(--muted)] mb-1">Target Nominal (Opsional)</label>
              <MoneyInput id="pocket-target" v-model="createForm.targetAmount" :min="0" :step="10000" :required="false" />
            </div>
            <div v-if="createError" class="p-2.5 rounded-[8px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-xs">
              {{ createError }}
            </div>
            <button type="submit" :disabled="!store.canUse('allow_pockets')" class="w-full sk-btn">Buat Kantong Baru</button>
          </form>
        </div>
      </aside>
    </div>
  </div>
</template>

