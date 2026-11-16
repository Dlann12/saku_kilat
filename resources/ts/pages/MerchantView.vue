<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import MoneyInput from '@/components/common/MoneyInput.vue';
import QrCodeBox from '@/components/common/QrCodeBox.vue';
import { useSessionStore } from '@/stores/session';
import type { MerchantDashboard, TransactionRecord } from '@/types/sakukilat';
import { apiFetch, makeIdempotencyKey } from '@/utils/api';
import { formatRupiah } from '@/utils/format';

const store = useSessionStore();
const dashboard = ref<MerchantDashboard | null>(null);
const selectedMerchantId = shallowRef('');
const dynamicAmount = shallowRef(45000);
const activeQrPayload = shallowRef('');
const activeQrLabel = shallowRef('QRIS Statis Outlet (bisa langsung dipindai)');
const settleError = shallowRef('');

const settleForm = reactive({
  merchantId: '',
  bank: 'BCA',
  accountNumber: '8810023456',
  amount: 100000,
});

const merchantOwner = computed(() => store.demoPersonas.find((p) => p.role === 'MERCHANT'));
const primaryMerchant = computed(
  () => dashboard.value?.merchants.find((m) => m.id === selectedMerchantId.value) ?? dashboard.value?.merchants[0] ?? null
);

async function loadMerchant(): Promise<void> {
  if (!store.user) return;
  const data = await apiFetch<MerchantDashboard>('/api/v1/merchant');
  dashboard.value = data;
  const first = data.merchants[0];
  if (first) {
    selectedMerchantId.value = first.id;
    settleForm.merchantId = first.id;
    activeQrPayload.value = first.static_qris_payload;
    activeQrLabel.value = 'QRIS Statis Outlet (bisa langsung dipindai)';
  }
}

watch(() => store.user?.id, () => void loadMerchant(), { immediate: true });

async function generateDynamicQr(): Promise<void> {
  if (!selectedMerchantId.value) return;
  const res = await apiFetch<{ raw_qr_payload: string; amount: number }>('/api/v1/merchant/qris', {
    method: 'POST',
    body: {
      merchant_id: selectedMerchantId.value,
      amount: dynamicAmount.value,
      is_dynamic: true,
    },
  });
  activeQrPayload.value = res.raw_qr_payload;
  activeQrLabel.value = `QRIS Dinamis (${formatRupiah(res.amount)})`;
}

function submitSettlement(): void {
  settleError.value = '';
  const idempotencyKey = makeIdempotencyKey('settle');
  const amt = settleForm.amount;
  store.requestPin({
    title: 'Konfirmasi Pencairan Saldo Merchant',
    amount: amt,
    onAuthorized: async (txAuthToken) => {
      try {
        const tx = await apiFetch<TransactionRecord>('/api/v1/merchant/settle', {
          method: 'POST',
          idempotencyKey,
          body: {
            merchant_id: settleForm.merchantId,
            destination_bank: settleForm.bank,
            account_number: settleForm.accountNumber.trim(),
            amount: amt,
            tx_auth_token: txAuthToken,
          },
        });
        await loadMerchant();
        store.openReceipt(tx);
      } catch (err) {
        settleError.value = err instanceof Error ? err.message : 'Settlement gagal.';
      }
    },
  });
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">
          SakuKilat Bisnis (Merchant UMKM)
        </h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Kelola kode QRIS dinamis per transaksi dan pencairan instan saldo toko (Rp 2.500)
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Beranda</RouterLink>
    </div>

    <div
      v-if="dashboard && !dashboard.is_owner && merchantOwner"
      class="mb-5 p-4 rounded-[14px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] flex flex-wrap items-center justify-between gap-3"
    >
      <div class="text-sm">
        Anda sedang melihat pratinjau publik. Beralihlah ke akun <strong>{{ merchantOwner.full_name }}</strong> untuk mencairkan saldo settlement toko.
      </div>
      <button type="button" class="sk-btn min-h-[34px] text-xs" @click="store.switchDemoPersona(merchantOwner.id)">
        Masuk sebagai {{ merchantOwner.full_name }}
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
      <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Saldo Settlement Tersedia</p>
        <p class="mt-1 text-2xl font-semibold num text-[var(--positive)]">
          {{ formatRupiah(dashboard?.total_settlement_balance) }}
        </p>
      </div>
      <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Omzet QRIS Sukses</p>
        <p class="mt-1 text-2xl font-semibold num">{{ formatRupiah(dashboard?.total_qris_gross) }}</p>
      </div>
      <div class="sk-card">
        <p class="text-xs text-[var(--muted)]">Total Toko Terdaftar</p>
        <p class="mt-1 text-2xl font-semibold num">{{ dashboard?.merchants.length ?? 0 }} Outlet</p>
      </div>
    </div>

    <div v-if="primaryMerchant" class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="sk-card lg:col-span-6 space-y-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="text-[16px] font-semibold">{{ primaryMerchant.merchant_name }}</h2>
            <p class="text-xs text-[var(--muted)]">
              {{ primaryMerchant.merchant_city }} • Skala {{ primaryMerchant.category_scale }} (MDR {{ primaryMerchant.mdr_bps / 100 }}%)
            </p>
            <p class="font-mono-id text-[11px] text-[var(--faint)] mt-0.5">NMID: {{ primaryMerchant.nmid }}</p>
          </div>
          <span class="sk-pill sk-pill-pos">Aktif</span>
        </div>

        <form class="space-y-3" @submit.prevent="generateDynamicQr">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="m-select" class="block text-xs font-medium text-[var(--muted)] mb-1">Pilih Outlet Merchant</label>
              <select id="m-select" v-model="selectedMerchantId" class="sk-input text-sm">
                <option v-for="m in dashboard?.merchants ?? []" :key="m.id" :value="m.id">{{ m.merchant_name }}</option>
              </select>
            </div>
            <div>
              <label for="m-qr-amount" class="block text-xs font-medium text-[var(--muted)] mb-1">
                Nominal Tagihan QRIS Dinamis
              </label>
              <MoneyInput id="m-qr-amount" v-model="dynamicAmount" :step="500" />
            </div>
          </div>
          <button type="submit" class="w-full sk-btn sk-btn-primary">Buat QRIS Dinamis Kasir</button>
        </form>

        <div class="p-4 rounded-[14px] border border-[var(--border)] bg-[var(--ground)] flex flex-col items-center text-center">
          <div class="bg-white p-3 rounded-[10px] border border-[var(--border)]">
            <QrCodeBox :value="activeQrPayload" :size="190" :alt="activeQrLabel" />
          </div>
          <p class="text-xs font-medium mt-2.5">{{ activeQrLabel }}</p>
          <p class="mt-1 font-mono-id text-[11px] text-[var(--muted)] break-all max-w-full">
            {{ activeQrPayload }}
          </p>
        </div>
      </section>

      <section class="sk-card lg:col-span-6 space-y-4">
        <div>
          <h2 class="text-[16px] font-semibold">Pencairan Instan ke Rekening Bank (Settlement)</h2>
          <p class="text-xs text-[var(--muted)] mt-0.5">
            Biaya pencairan flat Rp 2.500 per instruksi, langsung tercatat ke buku besar ganda.
          </p>
        </div>

        <div v-if="settleError" class="p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {{ settleError }}
        </div>

        <form class="space-y-3.5" @submit.prevent="submitSettlement">
          <div>
            <label for="settle-merchant" class="block text-xs font-medium text-[var(--muted)] mb-1">Outlet Sumber Dana</label>
            <select id="settle-merchant" v-model="settleForm.merchantId" class="sk-input text-sm">
              <option v-for="m in dashboard?.merchants ?? []" :key="m.id" :value="m.id">
                {{ m.merchant_name }} - {{ formatRupiah(m.balance) }}
              </option>
            </select>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="settle-bank" class="block text-xs font-medium text-[var(--muted)] mb-1">Bank Tujuan</label>
              <select id="settle-bank" v-model="settleForm.bank" class="sk-input text-sm">
                <option value="BCA">Bank BCA</option>
                <option value="MANDIRI">Bank Mandiri</option>
                <option value="BRI">Bank BRI</option>
                <option value="BNI">Bank BNI</option>
              </select>
            </div>
            <div>
              <label for="settle-account" class="block text-xs font-medium text-[var(--muted)] mb-1">Nomor Rekening</label>
              <input id="settle-account" v-model="settleForm.accountNumber" type="text" required class="sk-input font-mono-id text-sm" />
            </div>
          </div>
          <div>
            <label for="settle-amount" class="block text-xs font-medium text-[var(--muted)] mb-1">
              Nominal Cairkan Kotor (Min Rp 10.000)
            </label>
            <MoneyInput id="settle-amount" v-model="settleForm.amount" :min="10000" />
          </div>
          <button type="submit" :disabled="!dashboard?.is_owner" class="w-full sk-btn sk-btn-primary">
            Cairkan Dana Sekarang (PIN)
          </button>
        </form>

        <div class="pt-3 border-t border-[var(--rule)]">
          <h3 class="text-sm font-semibold mb-2">Transaksi Masuk QRIS Terkini</h3>
          <div v-if="dashboard?.incoming_qris.length" class="divide-y divide-[var(--rule)] max-h-[220px] overflow-y-auto">
            <div v-for="qtx in dashboard.incoming_qris" :key="qtx.id" class="py-2 flex items-center justify-between gap-2 text-xs">
              <div class="min-w-0">
                <p class="font-medium truncate text-[var(--text)]">{{ qtx.title }}</p>
                <p class="font-mono-id text-[11px] text-[var(--faint)]">{{ qtx.reference_number }}</p>
              </div>
              <span class="font-semibold num text-[var(--positive)]">+{{ formatRupiah(qtx.amount) }}</span>
            </div>
          </div>
          <p v-else class="py-4 text-center text-xs text-[var(--muted)]">Belum ada transaksi masuk.</p>
        </div>
      </section>
    </div>
  </div>
</template>

