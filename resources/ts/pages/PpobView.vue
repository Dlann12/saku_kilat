<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import FeatureDisabledNotice from '@/components/common/FeatureDisabledNotice.vue';
import { useSessionStore } from '@/stores/session';
import type { PpobInquiry, PpobProduct, TransactionRecord } from '@/types/sakukilat';
import { apiFetch, makeIdempotencyKey } from '@/utils/api';
import { formatRupiah } from '@/utils/format';

const route = useRoute();
const store = useSessionStore();

const products = ref<PpobProduct[]>([]);
const activeCat = shallowRef(typeof route.query.cat === 'string' ? route.query.cat.toUpperCase() : 'ALL');
const selectedProduct = ref<PpobProduct | null>(null);
const customerNumber = shallowRef('085211223344');
const inquiry = ref<PpobInquiry | null>(null);
const selectedWalletId = shallowRef('');
const errorMsg = shallowRef('');

const categories = [
  { code: 'ALL', label: 'Semua Produk' },
  { code: 'PULSA', label: 'Pulsa' },
  { code: 'DATA', label: 'Paket Data' },
  { code: 'PLN', label: 'Listrik PLN' },
  { code: 'PDAM', label: 'PDAM' },
  { code: 'BPJS', label: 'BPJS' },
  { code: 'GAME', label: 'Voucher Game' },
];

const usableWallets = computed(() =>
  (store.walletSummary?.wallets ?? []).filter((w) => ['MAIN', 'POCKET'].includes(w.wallet_type))
);

const filteredProducts = computed(() =>
  products.value.filter((p) => {
    if (activeCat.value === 'ALL') return true;
    if (activeCat.value === 'PLN') return p.category.startsWith('PLN');
    return p.category === activeCat.value;
  })
);

async function loadPpob(): Promise<void> {
  const [catRes] = await Promise.all([
    apiFetch<{ products: PpobProduct[] }>('/api/v1/ppob/catalog'),
    store.user ? store.fetchWallets() : Promise.resolve(null),
  ]);
  products.value = catRes.products;
  if (!selectedProduct.value && filteredProducts.value.length) {
    selectedProduct.value = filteredProducts.value[0];
  } else if (!selectedProduct.value && products.value.length) {
    selectedProduct.value = products.value[0];
  }
  if (!selectedWalletId.value && usableWallets.value.length) {
    selectedWalletId.value = usableWallets.value[0].id;
  }
}

watch(() => store.user?.id, () => void loadPpob(), { immediate: true });

function selectProduct(p: PpobProduct): void {
  selectedProduct.value = p;
  inquiry.value = null;
}

async function runInquiry(): Promise<void> {
  if (!selectedProduct.value) return;
  errorMsg.value = '';
  try {
    inquiry.value = await apiFetch<PpobInquiry>('/api/v1/ppob/inquire', {
      method: 'POST',
      body: {
        product_code: selectedProduct.value.code,
        customer_number: customerNumber.value.trim(),
      },
    });
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Cek tagihan gagal.';
  }
}

function submitOrder(): void {
  if (!selectedProduct.value) return;
  const prod = selectedProduct.value;
  const totalPayable = inquiry.value?.total_payable ?? prod.base_price + prod.admin_fee;
  const idempotencyKey = makeIdempotencyKey('ppob');

  store.requestPin({
    title: `Bayar ${prod.name}`,
    amount: totalPayable,
    onAuthorized: async (txAuthToken) => {
      try {
        const tx = await apiFetch<TransactionRecord>('/api/v1/ppob/execute', {
          method: 'POST',
          idempotencyKey,
          body: {
            product_code: prod.code,
            customer_number: customerNumber.value.trim(),
            source_wallet_id: selectedWalletId.value,
            tx_auth_token: txAuthToken,
          },
        });
        await store.fetchWallets();
        store.openReceipt(tx);
      } catch (err) {
        errorMsg.value = err instanceof Error ? err.message : 'Pembelian gagal.';
      }
    },
  });
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Bayar &amp; Beli PPOB</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Pulsa, paket data, token listrik PLN 20-digit instan, tagihan PDAM, BPJS &amp; voucher game
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Kembali</RouterLink>
    </div>

    <FeatureDisabledNotice :enabled="store.canUse('allow_ppob')" feature-name="Pembelian & Tagihan PPOB" />

    <div class="flex flex-wrap gap-2 mb-5">
      <button
        v-for="cat in categories"
        :key="cat.code"
        type="button"
        class="sk-btn min-h-[34px] px-3.5 text-xs"
        :class="activeCat === cat.code ? 'sk-btn-primary' : ''"
        @click="activeCat = cat.code"
      >
        {{ cat.label }}
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          v-for="p in filteredProducts"
          :key="p.code"
          type="button"
          class="sk-card p-4 text-left hover:border-[var(--accent)] transition-colors flex flex-col justify-between gap-3"
          :class="selectedProduct?.code === p.code ? 'border-[var(--accent)] bg-[var(--raised)]' : ''"
          @click="selectProduct(p)"
        >
          <div>
            <div class="flex items-center justify-between gap-2">
              <span class="sk-pill sk-pill-neutral">{{ p.provider }}</span>
              <span class="text-[11px] font-mono-id text-[var(--faint)]">{{ p.category }}</span>
            </div>
            <h2 class="text-sm font-semibold mt-2 text-[var(--text)]">{{ p.name }}</h2>
            <p class="text-xs text-[var(--muted)] mt-0.5">{{ p.description }}</p>
          </div>
          <div class="pt-2 border-t border-[var(--rule)] flex items-baseline justify-between">
            <span class="text-base font-semibold num text-[var(--accent)]">
              {{ formatRupiah(p.base_price + p.admin_fee) }}
            </span>
            <span class="text-[11px] text-[var(--faint)] num">Termasuk admin {{ formatRupiah(p.admin_fee) }}</span>
          </div>
        </button>
      </section>

      <aside v-if="selectedProduct" class="sk-card lg:col-span-5 space-y-4">
        <div>
          <h2 class="text-[16px] font-semibold">Rincian Pembelian / Tagihan</h2>
          <p class="text-xs font-medium text-[var(--accent)] mt-0.5">{{ selectedProduct.name }}</p>
        </div>

        <div v-if="errorMsg" class="p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {{ errorMsg }}
        </div>

        <form class="space-y-4" @submit.prevent="submitOrder">
          <div>
            <label for="ppob-customer" class="block text-xs font-medium text-[var(--muted)] mb-1.5">
              Nomor HP / ID Pelanggan / ID Meter PLN
            </label>
            <div class="flex flex-col sm:flex-row gap-2">
              <input id="ppob-customer" v-model="customerNumber" type="text" required class="sk-input font-mono-id text-sm" />
              <button type="button" class="sk-btn shrink-0" @click="runInquiry">Cek Tagihan</button>
            </div>
          </div>

          <div class="p-3.5 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-1.5 text-sm">
            <div class="flex justify-between">
              <span class="text-[var(--muted)]">Pelanggan</span>
              <span class="font-medium font-mono-id">
                {{ inquiry ? `${inquiry.customer_name} (${inquiry.period})` : customerNumber }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--muted)]">Harga Produk</span>
              <span class="num">{{ formatRupiah(inquiry?.base_price ?? selectedProduct.base_price) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--muted)]">Biaya Admin</span>
              <span class="num">{{ formatRupiah(inquiry?.admin_fee ?? selectedProduct.admin_fee) }}</span>
            </div>
            <div class="pt-2 border-t border-[var(--rule)] flex justify-between font-semibold">
              <span>Total Bayar</span>
              <span class="text-[var(--accent)] num">
                {{ formatRupiah(inquiry?.total_payable ?? selectedProduct.base_price + selectedProduct.admin_fee) }}
              </span>
            </div>
          </div>

          <div>
            <label for="ppob-wallet" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Sumber Dana</label>
            <select id="ppob-wallet" v-model="selectedWalletId" class="sk-input text-sm">
              <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                {{ w.name }} - {{ formatRupiah(w.balance) }}
              </option>
            </select>
          </div>

          <button type="submit" :disabled="!store.canUse('allow_ppob')" class="w-full sk-btn sk-btn-primary">
            Bayar &amp; Terbitkan Resi (PIN)
          </button>
        </form>
      </aside>
    </div>
  </div>
</template>

