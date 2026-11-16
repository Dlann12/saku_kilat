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
const sortMode = shallowRef<'default' | 'balance-desc'>('default');

const usableWallets = computed(() =>
  (store.walletSummary?.wallets ?? []).filter((w) => ['MAIN', 'POCKET'].includes(w.wallet_type))
);

const pocketsList = computed(() => {
  const list = [...(store.walletSummary?.pockets ?? [])];
  if (sortMode.value === 'balance-desc') {
    return list.sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
  }
  return list;
});

const totalTargets = computed(() =>
  pocketsList.value.reduce((sum, p) => sum + Number(p.target_amount ?? 0), 0)
);

const overallTargetPct = computed(() => {
  const totalPockets = Number(store.walletSummary?.pockets_total ?? 0);
  if (totalTargets.value <= 0) return 0;
  return Math.min(100, Math.round((totalPockets / totalTargets.value) * 100));
});

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

function categoryIcon(categoryKey?: string | null): string {
  switch ((categoryKey ?? '').toLowerCase()) {
    case 'food':
      return 'store';
    case 'transport':
      return 'send';
    case 'bills':
      return 'zap';
    default:
      return 'shield';
  }
}

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

function prefillMoveToPocket(pocket: Wallet): void {
  const mainId = store.walletSummary?.main_wallet?.id || usableWallets.value[0]?.id || '';
  if (mainId) moveForm.sourceWalletId = mainId;
  moveForm.destinationWalletId = pocket.id;
  document.getElementById('move-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        <h1 class="text-[22px] sm:text-[26px] font-bold tracking-tight">Kantong Nabung</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Pisahkan pos anggaran, kunci saldo tabungan, dan pindahkan dana internal gratis Rp 0
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Beranda</RouterLink>
    </div>

    <FeatureDisabledNotice :enabled="store.canUse('allow_pockets')" feature-name="Kantong Nabung (Buat & Pindah Saldo)" />

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <!-- Left Column: Hero Savings + Active Pockets -->
      <section class="lg:col-span-7 space-y-4">
        <!-- Emerald Savings Hero Card matching screen 09 -->
        <div class="sk-hero-emerald space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-semibold text-white/90">Total Terkumpul di Kantong Nabung</span>
            <span class="sk-pill bg-white/15 text-white">
              {{ pocketsList.length }} Kantong Aktif
            </span>
          </div>

          <p class="text-[28px] sm:text-[34px] font-bold tracking-tight num">
            {{ formatRupiah(store.walletSummary?.pockets_total ?? 0) }}
          </p>

          <div v-if="totalTargets > 0" class="space-y-1.5">
            <div class="flex items-center justify-between text-xs text-white/90">
              <span>Target Gabungan: <strong class="num">{{ formatRupiah(totalTargets) }}</strong></span>
              <span class="font-bold num">{{ overallTargetPct }}% Tercapai</span>
            </div>
            <div class="h-2 w-full rounded-full bg-white/20 overflow-hidden">
              <div class="h-full rounded-full bg-white" :style="{ width: `${overallTargetPct}%` }" />
            </div>
          </div>

          <div class="pt-2 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-xs text-white/90">
            <span>Saku Utama: <strong class="num text-white">{{ formatRupiah(store.walletSummary?.main_balance ?? 0) }}</strong></span>
            <span>Total Akun: <strong class="num text-white">{{ formatRupiah(store.walletSummary?.total_balance ?? 0) }}</strong></span>
          </div>
        </div>

        <!-- Section Header + Sort Toggle -->
        <div class="flex items-center justify-between gap-2 pt-1">
          <h2 class="text-[16px] font-bold">Kantong Aktif ({{ pocketsList.length }})</h2>
          <button
            type="button"
            class="min-h-[38px] px-3 rounded-[10px] bg-[var(--container-low)] border border-[var(--border)] text-xs font-semibold text-[var(--variant)] inline-flex items-center gap-1.5 hover:bg-[var(--container)]"
            @click="sortMode = sortMode === 'default' ? 'balance-desc' : 'default'"
          >
            <AppIcon name="sort" size-class="w-3.5 h-3.5" />
            <span>{{ sortMode === 'balance-desc' ? 'Saldo Tertinggi' : 'Urutkan' }}</span>
          </button>
        </div>

        <!-- Pocket Cards -->
        <div v-if="pocketsList.length" class="space-y-3">
          <div v-for="pocket in pocketsList" :key="pocket.id" class="sk-card space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 min-w-0">
                <span
                  class="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0"
                  :style="{
                    background: pocketColors(pocket.category_key).bg,
                    color: pocketColors(pocket.category_key).ink,
                  }"
                >
                  <AppIcon :name="categoryIcon(pocket.category_key)" size-class="w-5 h-5" />
                </span>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-base font-bold truncate">{{ pocket.name }}</h3>
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
                        ? 'Saldo dilindungi: tidak bisa dipakai debit sebelum kunci dibuka.'
                        : 'Aktif dan bisa dipilih saat bayar QRIS atau transfer.'
                    }}
                  </p>
                </div>
              </div>
              <p class="text-lg font-bold num text-[var(--text)] shrink-0">{{ formatRupiah(pocket.balance) }}</p>
            </div>

            <div v-if="Number(pocket.target_amount ?? 0) > 0">
              <div class="flex justify-between text-xs text-[var(--muted)] mb-1">
                <span>Progres Target</span>
                <span class="num font-semibold text-[var(--text)]">
                  {{ formatRupiah(pocket.balance) }} / {{ formatRupiah(pocket.target_amount) }} ({{ progressPercent(pocket) }}%)
                </span>
              </div>
              <div class="h-2 w-full rounded-full bg-[var(--container)] overflow-hidden">
                <div class="h-full rounded-full bg-[var(--primary)]" :style="{ width: `${progressPercent(pocket)}%` }" />
              </div>
            </div>

            <div class="pt-2.5 border-t border-[var(--rule)] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                class="sk-btn min-h-[38px] px-3 text-xs"
                @click="toggleLock(pocket)"
              >
                <AppIcon :name="pocket.is_locked ? 'lock-open' : 'lock'" size-class="w-3.5 h-3.5" />
                <span>{{ pocket.is_locked ? 'Buka Kunci' : 'Kunci Saldo' }}</span>
              </button>

              <button
                type="button"
                class="sk-btn sk-btn-primary min-h-[38px] px-3.5 text-xs"
                @click="prefillMoveToPocket(pocket)"
              >
                <AppIcon name="plus" size-class="w-3.5 h-3.5" />
                <span>Isi Kantong Ini</span>
              </button>
            </div>
          </div>
        </div>

        <div v-else class="sk-card text-center py-8">
          <p class="text-sm text-[var(--muted)]">Belum ada Kantong Nabung. Buat kantong baru di formulir samping.</p>
        </div>
      </section>

      <!-- Right Column: Internal Move & Create New Pocket -->
      <aside class="lg:col-span-5 space-y-5">
        <div id="move-section" class="sk-card space-y-4">
          <div>
            <h2 class="text-[16px] font-bold">Pindah Saldo Internal (Rp 0)</h2>
            <p class="text-xs text-[var(--muted)]">
              Pindah instan antara Saku Utama dan Kantong Nabung bebas biaya admin
            </p>
          </div>

          <form class="space-y-3" @submit.prevent="moveBalance">
            <div>
              <label for="move-from" class="block text-xs font-semibold text-[var(--muted)] mb-1">Dari Dompet</label>
              <select id="move-from" v-model="moveForm.sourceWalletId" class="sk-input text-sm">
                <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                  {{ w.name }} ({{ formatRupiah(w.balance) }})
                </option>
              </select>
            </div>
            <div>
              <label for="move-to" class="block text-xs font-semibold text-[var(--muted)] mb-1">Ke Dompet Tujuan</label>
              <select id="move-to" v-model="moveForm.destinationWalletId" class="sk-input text-sm">
                <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                  {{ w.name }} ({{ formatRupiah(w.balance) }})
                </option>
              </select>
            </div>
            <div>
              <label for="move-amount" class="block text-xs font-semibold text-[var(--muted)] mb-1">Nominal Pindah</label>
              <MoneyInput id="move-amount" v-model="moveForm.amount" />
            </div>
            <div v-if="moveError" class="p-2.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-xs font-medium">
              {{ moveError }}
            </div>
            <button type="submit" :disabled="!store.canUse('allow_pockets')" class="w-full sk-btn sk-btn-primary">
              Pindahkan Sekarang
            </button>
          </form>
        </div>

        <div class="sk-card space-y-4">
          <div>
            <h2 class="text-[16px] font-bold">Buat Kantong Impian Baru</h2>
            <p class="text-xs text-[var(--muted)]">Buat pos anggaran khusus dengan target tabungan terukur</p>
          </div>

          <form class="space-y-3" @submit.prevent="createPocket">
            <div>
              <label for="pocket-name" class="block text-xs font-semibold text-[var(--muted)] mb-1">Nama Kantong</label>
              <input id="pocket-name" v-model="createForm.name" type="text" placeholder="Contoh: Dana Darurat" required class="sk-input text-sm" />
            </div>
            <div>
              <label for="pocket-category" class="block text-xs font-semibold text-[var(--muted)] mb-1">Kategori</label>
              <select id="pocket-category" v-model="createForm.categoryKey" class="sk-input text-sm">
                <option value="savings">Tabungan / Dana Darurat</option>
                <option value="food">Konsumsi &amp; Harian</option>
                <option value="transport">Transportasi</option>
                <option value="bills">Tagihan Rutin</option>
              </select>
            </div>
            <div>
              <label for="pocket-target" class="block text-xs font-semibold text-[var(--muted)] mb-1">Target Nominal (Opsional)</label>
              <MoneyInput id="pocket-target" v-model="createForm.targetAmount" :min="0" :step="10000" :required="false" />
            </div>
            <div v-if="createError" class="p-2.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-xs font-medium">
              {{ createError }}
            </div>
            <button type="submit" :disabled="!store.canUse('allow_pockets')" class="w-full sk-btn">
              <AppIcon name="plus" />
              <span>Buat Kantong Baru</span>
            </button>
          </form>
        </div>
      </aside>
    </div>
  </div>
</template>
