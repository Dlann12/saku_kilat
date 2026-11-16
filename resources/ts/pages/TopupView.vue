<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
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
const errorMsg = shallowRef('');
const activeOrder = ref<TopupOrder | null>(null);

const totalBal = computed(() => Number(store.walletSummary?.total_balance ?? 0));
const limitBal = computed(() => Number(store.walletSummary?.balance_limit ?? 2_000_000));
const remainingCap = computed(() => Math.max(0, limitBal.value - totalBal.value));

async function loadTopup(): Promise<void> {
  if (!store.user) return;
  const [chRes] = await Promise.all([
    apiFetch<{ channels: Record<string, TopupChannelConfig> }>('/api/v1/topups'),
    store.fetchWallets(),
  ]);
  channels.value = chRes.channels;
  if (!channels.value[selectedChannel.value]) {
    selectedChannel.value = Object.keys(channels.value)[0] || 'VA_BCA';
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
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Top Up Saldo</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Isi ulang Dompet Utama instan melalui Virtual Account, Gerai Ritel, atau Kartu Debit
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Kembali</RouterLink>
    </div>

    <FeatureDisabledNotice :enabled="store.canUse('allow_topup')" feature-name="Top Up Saldo" />

    <div
      v-if="store.user?.kyc_status !== 'VERIFIED'"
      class="mb-5 p-4 rounded-[14px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] flex flex-wrap items-center justify-between gap-3"
    >
      <div class="text-sm">
        <strong>Akun Basic (Limit Rp 2.000.000):</strong>
        Sisa kapasitas Top Up saat ini <span class="font-semibold num">{{ formatRupiah(remainingCap) }}</span>.
      </div>
      <RouterLink to="/profil" class="sk-btn min-h-[34px] text-xs">Upgrade ke SakuKilat Plus</RouterLink>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="sk-card lg:col-span-7 space-y-5">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-[12px] bg-[var(--ground)] border border-[var(--border)]">
          <div>
            <p class="text-xs text-[var(--muted)]">Total Saldo Saat Ini</p>
            <p class="text-lg font-semibold num">{{ formatRupiah(totalBal) }}</p>
          </div>
          <div>
            <p class="text-xs text-[var(--muted)]">Batas Maksimum Akun</p>
            <p class="text-lg font-semibold num">{{ formatRupiah(limitBal) }}</p>
          </div>
        </div>

        <form class="space-y-4" @submit.prevent="createTopup">
          <div>
            <label class="block text-xs font-medium text-[var(--muted)] mb-2">1. Pilih Metode Isi Saldo</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label
                v-for="(ch, code) in channels"
                :key="code"
                class="p-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] cursor-pointer flex items-start gap-2.5"
              >
                <input v-model="selectedChannel" type="radio" :value="code" class="mt-1 accent-[var(--accent)]" />
                <div class="min-w-0">
                  <p class="text-sm font-semibold leading-tight">{{ ch.label }}</p>
                  <p class="text-xs text-[var(--muted)] mt-0.5 num">
                    {{ ch.fee > 0 ? `Admin ${formatRupiah(ch.fee)}` : 'Gratis Biaya Admin' }}
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label for="topup-amount" class="block text-xs font-medium text-[var(--muted)] mb-2">
              2. Nominal Top Up (Minimal Rp 10.000)
            </label>
            <MoneyInput id="topup-amount" v-model="amount" :min="10000" />
            <div class="mt-2.5 flex flex-wrap gap-2">
              <button
                v-for="preset in [50000, 100000, 250000, 500000, 1000000]"
                :key="preset"
                type="button"
                class="sk-btn min-h-[34px] px-3 text-xs num"
                @click="amount = preset"
              >
                {{ formatRupiah(preset) }}
              </button>
            </div>
          </div>

          <div class="p-3.5 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] flex items-center justify-between text-sm">
            <span class="text-[var(--muted)]">Total Masuk ke Dompet Utama</span>
            <span class="text-base font-semibold text-[var(--accent)] num">{{ formatRupiah(amount) }}</span>
          </div>

          <div
            v-if="errorMsg"
            class="p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"
          >
            {{ errorMsg }}
          </div>

          <button type="submit" :disabled="!store.canUse('allow_topup')" class="w-full sk-btn sk-btn-primary">
            Buat Nomor Virtual Account / Instruksi
          </button>
        </form>

        <div
          v-if="activeOrder"
          class="p-4 rounded-[14px] border border-[#bfe1ff] bg-[var(--raised)] space-y-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-xs font-medium text-[var(--accent-ink)]">{{ activeOrder.channel_label }}</p>
              <p class="text-xs text-[var(--muted)]">Menunggu pelunasan dari bank mitra (Webhook HMAC-SHA256)</p>
            </div>
            <span class="sk-pill sk-pill-warn">MENUNGGU</span>
          </div>

          <div class="p-3 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs text-[var(--muted)]">Nomor Virtual Account / Kode Bayar</p>
              <p class="text-lg font-semibold font-mono-id tracking-wider mt-0.5">{{ activeOrder.va_number }}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-[var(--muted)]">Nominal</p>
              <p class="text-base font-semibold num">{{ formatRupiah(activeOrder.amount) }}</p>
            </div>
          </div>

          <button type="button" class="w-full sk-btn sk-btn-dark" @click="simulateVaWebhook(activeOrder.external_ref)">
            Simulasikan Bayar Sekarang (Trigger Webhook Bank)
          </button>
        </div>
      </section>

      <aside class="sk-card lg:col-span-5">
        <h2 class="text-[16px] font-semibold">Permintaan Top Up Terakhir</h2>
        <p class="text-xs text-[var(--muted)] mt-0.5">Order status PENDING bisa langsung disimulasikan</p>

        <div v-if="store.walletSummary?.topup_orders?.length" class="mt-4 divide-y divide-[var(--rule)]">
          <div v-for="order in store.walletSummary.topup_orders" :key="order.id" class="py-3 first:pt-0 last:pb-0 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm font-medium truncate">{{ order.channel_label }}</p>
                <p class="text-xs font-mono-id text-[var(--muted)]">{{ order.va_number }}</p>
              </div>
              <span class="sk-pill" :class="order.status === 'PAID' ? 'sk-pill-pos' : 'sk-pill-warn'">
                {{ order.status }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-semibold num">{{ formatRupiah(order.amount) }}</span>
              <button
                v-if="order.status === 'PENDING'"
                type="button"
                class="sk-btn min-h-[32px] px-3 text-xs"
                @click="simulateVaWebhook(order.external_ref)"
              >
                Simulasi Bayar
              </button>
              <span v-else class="text-xs text-[var(--faint)]">{{ formatDateTimeWib(order.paid_at) }}</span>
            </div>
          </div>
        </div>
        <p v-else class="py-8 text-center text-sm text-[var(--muted)]">
          Belum ada riwayat permintaan Top Up.
        </p>
      </aside>
    </div>
  </div>
</template>

