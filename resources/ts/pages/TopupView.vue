<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import FeatureDisabledNotice from '@/components/common/FeatureDisabledNotice.vue';
import MoneyInput from '@/components/common/MoneyInput.vue';
import { useSessionStore } from '@/stores/session';
import type { TopupChannelConfig, TopupOrder, TransactionRecord } from '@/types/sakukilat';
import { apiFetch } from '@/utils/api';
import { formatDateTimeWib, formatRupiah } from '@/utils/format';

const store = useSessionStore();
const channels = ref<Record<string, TopupChannelConfig>>({});
const selectedChannel = shallowRef('VA_BCA');
const amount = shallowRef(100000);
const loading = shallowRef(true);
const errorMsg = shallowRef('');
const activeOrder = ref<TopupOrder | null>(null);

const presetNominals = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000];

const totalBal = computed(() => Number(store.walletSummary?.total_balance ?? 0));
const limitBal = computed(() => Number(store.walletSummary?.balance_limit ?? 2_000_000));
const remainingCap = computed(() => Math.max(0, limitBal.value - totalBal.value));

function channelIcon(code: string): string {
  const up = code.toUpperCase();
  if (up.includes('DEBIT') || up.includes('CARD')) return 'card';
  if (up.includes('ALFA') || up.includes('INDO') || up.includes('RETAIL')) return 'store';
  return 'bank';
}

async function loadTopup(): Promise<void> {
  if (!store.user) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const [chRes] = await Promise.all([
      apiFetch<{ channels: Record<string, TopupChannelConfig> }>('/api/v1/topups'),
      store.fetchWallets(),
    ]);
    channels.value = chRes.channels;
    if (!channels.value[selectedChannel.value]) {
      selectedChannel.value = Object.keys(channels.value)[0] || 'VA_BCA';
    }
  } finally {
    loading.value = false;
  }
}

watch(() => store.user?.id, () => void loadTopup(), { immediate: true });

async function createTopup(): Promise<void> {
  errorMsg.value = '';
  try {
    activeOrder.value = await apiFetch<TopupOrder>('/api/v1/topups', {
      method: 'POST',
      body: {
        channel: selectedChannel.value,
        amount: amount.value,
      },
    });
    await store.fetchWallets();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal membuat instruksi top up.';
  }
}

async function simulateVaWebhook(externalRef: string): Promise<void> {
  errorMsg.value = '';
  try {
    const res = await apiFetch<{ transaction?: TransactionRecord }>('/api/v1/sandbox/trigger-va', {
      method: 'POST',
      body: { external_ref: externalRef },
    });
    if (activeOrder.value?.external_ref === externalRef) {
      activeOrder.value = null;
    }
    await store.fetchWallets();
    if (res.transaction) {
      store.openReceipt(res.transaction);
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Simulasi webhook gagal.';
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-bold tracking-tight">Top Up Saldo</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Isi Saku Utama secara instan lewat Virtual Account, Kartu Debit, atau Gerai Ritel
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Beranda</RouterLink>
    </div>

    <FeatureDisabledNotice :enabled="store.canUse('allow_topup')" feature-name="Top Up Saldo" />

    <div
      v-if="store.user?.kyc_status !== 'VERIFIED'"
      class="mb-5 p-4 rounded-[16px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] flex flex-wrap items-center justify-between gap-3"
    >
      <div class="text-sm">
        <strong>Akun Basic (Limit {{ formatRupiah(limitBal) }}):</strong>
        Sisa kapasitas Top Up saat ini <span class="font-bold num">{{ formatRupiah(remainingCap) }}</span>.
      </div>
      <RouterLink to="/profil" class="sk-btn min-h-[38px] text-xs">Upgrade Saku Plus</RouterLink>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="lg:col-span-7 space-y-5">
        <!-- Emerald Current Balance Banner matching screen 06 -->
        <div class="sk-hero-emerald">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold text-white/90">Saldo Aktif Saat Ini (Saku Utama)</span>
            <span class="sk-pill bg-white/15 text-white">
              <AppIcon name="verified" size-class="w-3.5 h-3.5" />
              {{ store.user?.kyc_status === 'VERIFIED' ? 'Saku Plus' : 'Akun Basic' }}
            </span>
          </div>
          <p class="mt-2 text-[28px] sm:text-[32px] font-bold tracking-tight num">
            {{ loading && !store.walletSummary ? 'Memuat saldo...' : formatRupiah(totalBal) }}
          </p>
          <p class="mt-1 text-xs text-white/85 num">
            Batas Maksimum Akun: {{ formatRupiah(limitBal) }}
          </p>
        </div>

        <form class="sk-card space-y-5" @submit.prevent="createTopup">
          <!-- Step 1: Nominal & 6-Tile Quick Grid -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label for="topup-amount" class="text-sm font-bold text-[var(--text)]">
                Pilih Nominal Top Up
              </label>
              <span class="text-xs text-[var(--muted)]">Min. Rp 10.000</span>
            </div>
            <MoneyInput id="topup-amount" v-model="amount" :min="10000" />
            <div class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <button
                v-for="preset in presetNominals"
                :key="preset"
                type="button"
                class="min-h-[44px] px-3 rounded-[12px] text-xs font-bold num border transition-colors"
                :class="
                  amount === preset
                    ? 'bg-[var(--accent-soft)] border-[var(--primary)] text-[var(--accent-ink)]'
                    : 'bg-[var(--container-low)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--container)]'
                "
                @click="amount = preset"
              >
                {{ formatRupiah(preset) }}
              </button>
            </div>
          </div>

          <!-- Step 2: Metode Pembayaran -->
          <div>
            <p class="text-sm font-bold text-[var(--text)] mb-2.5">Metode Pembayaran</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label
                v-for="(ch, code) in channels"
                :key="code"
                class="p-3.5 rounded-[14px] border cursor-pointer flex items-start gap-3 transition-colors"
                :class="
                  selectedChannel === code
                    ? 'border-[var(--primary)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] bg-[var(--container-low)] hover:bg-[var(--container)]'
                "
              >
                <input
                  v-model="selectedChannel"
                  type="radio"
                  :value="code"
                  class="mt-1 accent-[var(--primary)]"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <AppIcon :name="channelIcon(String(code))" size-class="w-4 h-4 text-[var(--primary)] shrink-0" />
                    <p class="text-sm font-bold leading-tight truncate text-[var(--text)]">{{ ch.label }}</p>
                  </div>
                  <p
                    class="text-xs mt-1 font-medium num"
                    :class="ch.fee > 0 ? 'text-[var(--muted)]' : 'text-[var(--positive)]'"
                  >
                    {{ ch.fee > 0 ? `Admin ${formatRupiah(ch.fee)}` : 'Bebas Biaya Admin' }}
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div class="p-3.5 rounded-[14px] bg-[var(--container-low)] border border-[var(--border)] flex items-center justify-between text-sm">
            <span class="text-[var(--muted)]">Total Masuk ke Saku Utama</span>
            <span class="text-base font-bold text-[var(--primary)] num">{{ formatRupiah(amount) }}</span>
          </div>

          <div
            v-if="errorMsg"
            class="p-3 rounded-[12px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm font-medium"
          >
            {{ errorMsg }}
          </div>

          <button type="submit" :disabled="!store.canUse('allow_topup')" class="w-full sk-btn sk-btn-primary">
            Lanjutkan Top Up (Buat Virtual Account)
          </button>
        </form>

        <!-- Active Instruction Box -->
        <div
          v-if="activeOrder"
          class="sk-card !bg-[var(--accent-soft)] border-[var(--primary)]/35 space-y-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-bold text-[var(--accent-ink)]">{{ activeOrder.channel_label }}</p>
              <p class="text-xs text-[var(--variant)]">
                Menunggu pelunasan dari mitra bank (Webhook HMAC-SHA256)
              </p>
            </div>
            <span class="sk-pill sk-pill-warn">MENUNGGU</span>
          </div>

          <div class="p-3.5 rounded-[12px] bg-[var(--surface)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs text-[var(--muted)]">Nomor Virtual Account / Kode Bayar</p>
              <p class="text-lg font-bold font-mono-id tracking-wider mt-0.5 text-[var(--text)]">
                {{ activeOrder.va_number }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-xs text-[var(--muted)]">Nominal</p>
              <p class="text-base font-bold num text-[var(--primary)]">{{ formatRupiah(activeOrder.amount) }}</p>
            </div>
          </div>

          <button type="button" class="w-full sk-btn sk-btn-dark" @click="simulateVaWebhook(activeOrder.external_ref)">
            Simulasikan Bayar Sekarang (Trigger Webhook Bank)
          </button>
        </div>
      </section>

      <!-- Recent Orders List -->
      <aside class="sk-card lg:col-span-5">
        <h2 class="text-[16px] font-bold">Permintaan Top Up Terakhir</h2>
        <p class="text-xs text-[var(--muted)] mt-0.5">Order berstatus PENDING dapat disimulasikan langsung</p>

        <div v-if="store.walletSummary?.topup_orders?.length" class="mt-4 divide-y divide-[var(--rule)]">
          <div
            v-for="order in store.walletSummary.topup_orders"
            :key="order.id"
            class="py-3.5 first:pt-0 last:pb-0 space-y-2"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm font-bold truncate">{{ order.channel_label }}</p>
                <p class="text-xs font-mono-id text-[var(--muted)]">{{ order.va_number }}</p>
              </div>
              <span class="sk-pill" :class="order.status === 'PAID' ? 'sk-pill-pos' : 'sk-pill-warn'">
                {{ order.status }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-bold num">{{ formatRupiah(order.amount) }}</span>
              <button
                v-if="order.status === 'PENDING'"
                type="button"
                class="sk-btn min-h-[36px] px-3 text-xs"
                @click="simulateVaWebhook(order.external_ref)"
              >
                Simulasi Bayar
              </button>
              <span v-else class="text-xs text-[var(--muted)]">{{ formatDateTimeWib(order.paid_at) }}</span>
            </div>
          </div>
        </div>
        <p v-else class="py-10 text-center text-sm text-[var(--muted)]">
          Belum ada riwayat permintaan Top Up di akun ini.
        </p>
      </aside>
    </div>
  </div>
</template>
