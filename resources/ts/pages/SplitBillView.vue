<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import MoneyInput from '@/components/common/MoneyInput.vue';
import { useSessionStore } from '@/stores/session';
import type { SplitBill, TransactionRecord } from '@/types/sakukilat';
import { apiFetch, makeIdempotencyKey } from '@/utils/api';
import { formatRupiah } from '@/utils/format';

const store = useSessionStore();
const bills = ref<SplitBill[]>([]);
const peers = ref<Array<{ id: string; full_name: string; phone_number: string }>>([]);
const selectedPhones = ref<string[]>([]);
const payWalletId = shallowRef('');
const errorMsg = shallowRef('');

const form = reactive({
  title: '',
  mode: 'EQUAL' as 'EQUAL' | 'ITEMIZED',
  totalAmount: 150000,
  items: [
    { name: 'Nasi Goreng Spesial', price: 42000 },
    { name: 'Kopi Susu Gula Aren', price: 28000 },
  ],
});

const usableWallets = computed(() =>
  (store.walletSummary?.wallets ?? []).filter((w) => ['MAIN', 'POCKET'].includes(w.wallet_type))
);

async function loadSplitBills(): Promise<void> {
  if (!store.user) return;
  const [sbRes] = await Promise.all([
    apiFetch<{ bills: SplitBill[]; peers: Array<{ id: string; full_name: string; phone_number: string }> }>(
      '/api/v1/split-bills'
    ),
    store.fetchWallets(),
  ]);
  bills.value = sbRes.bills;
  peers.value = sbRes.peers;
  if (!selectedPhones.value.length && sbRes.peers.length) {
    selectedPhones.value = sbRes.peers.slice(0, 2).map((p) => p.phone_number);
  }
  if (!payWalletId.value && usableWallets.value.length) {
    payWalletId.value = usableWallets.value[0].id;
  }
}

watch(() => store.user?.id, () => void loadSplitBills(), { immediate: true });

function progressPct(b: SplitBill): number {
  return b.total_amount > 0 ? Math.min(100, Math.round((b.collected_amount / b.total_amount) * 100)) : 0;
}

function myPendingParticipant(b: SplitBill) {
  return b.participants.find((pt) => pt.user_id === store.user?.id && pt.status === 'PENDING');
}

async function createBill(): Promise<void> {
  errorMsg.value = '';
  if (!selectedPhones.value.length) {
    errorMsg.value = 'Pilih minimal 1 teman untuk patungan.';
    return;
  }

  try {
    const payload =
      form.mode === 'EQUAL'
        ? {
            title: form.title.trim(),
            split_mode: 'EQUAL',
            participant_phones: selectedPhones.value,
            total_amount: form.totalAmount,
          }
        : {
            title: form.title.trim(),
            split_mode: 'ITEMIZED',
            participant_phones: selectedPhones.value,
            items: form.items.map((item) => ({
              name: item.name.trim() || 'Item',
              price: Number(item.price || 1000),
              assigned_phones: [store.user?.phone_number || '', ...selectedPhones.value].filter(Boolean),
            })),
          };

    await apiFetch('/api/v1/split-bills', { method: 'POST', body: payload });
    form.title = '';
    await loadSplitBills();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal membuat tagihan patungan.';
  }
}

function payShare(bill: SplitBill, shareAmount: number): void {
  errorMsg.value = '';
  const idempotencyKey = makeIdempotencyKey('split');
  store.requestPin({
    title: `Bayar Patungan: ${bill.title}`,
    amount: shareAmount,
    onAuthorized: async (txAuthToken) => {
      try {
        const tx = await apiFetch<TransactionRecord>(`/api/v1/split-bills/${bill.id}/pay`, {
          method: 'POST',
          idempotencyKey,
          body: {
            source_wallet_id: payWalletId.value,
            tx_auth_token: txAuthToken,
          },
        });
        await loadSplitBills();
        store.openReceipt(tx);
      } catch (err) {
        errorMsg.value = err instanceof Error ? err.message : 'Pembayaran patungan gagal.';
      }
    },
  });
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Patungan (Split Bill)</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Bagi tagihan merata atau per item pesanan bersama teman SakuKilat
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Kembali</RouterLink>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="sk-card lg:col-span-5 space-y-4">
        <div>
          <h2 class="text-[16px] font-semibold">Buat Tagihan Patungan</h2>
          <p class="text-xs text-[var(--muted)]">
            Peserta otomatis menerima notifikasi dan bisa langsung bayar via PIN
          </p>
        </div>

        <div v-if="errorMsg" class="p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {{ errorMsg }}
        </div>

        <form class="space-y-4" @submit.prevent="createBill">
          <div>
            <label for="sb-title" class="block text-xs font-medium text-[var(--muted)] mb-1">Judul Tagihan</label>
            <input id="sb-title" v-model="form.title" type="text" placeholder="Contoh: Makan Siang Tim" required class="sk-input text-sm" />
          </div>

          <div>
            <label class="block text-xs font-medium text-[var(--muted)] mb-1.5">Metode Pembagian</label>
            <div class="grid grid-cols-2 gap-2">
              <label class="p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] cursor-pointer flex items-center gap-2 text-sm">
                <input v-model="form.mode" type="radio" value="EQUAL" class="accent-[var(--accent)]" />
                <span>Bagi Rata</span>
              </label>
              <label class="p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] cursor-pointer flex items-center gap-2 text-sm">
                <input v-model="form.mode" type="radio" value="ITEMIZED" class="accent-[var(--accent)]" />
                <span>Per Item</span>
              </label>
            </div>
          </div>

          <div v-if="form.mode === 'EQUAL'">
            <label for="sb-total" class="block text-xs font-medium text-[var(--muted)] mb-1">Total Tagihan</label>
            <MoneyInput id="sb-total" v-model="form.totalAmount" />
          </div>

          <div v-else class="space-y-2.5 pt-2 border-t border-[var(--rule)]">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-[var(--muted)]">Daftar Item Pesanan</span>
              <button
                type="button"
                class="text-xs font-medium text-[var(--accent)]"
                @click="form.items.push({ name: '', price: 25000 })"
              >
                + Tambah Item
              </button>
            </div>
            <div
              v-for="(item, idx) in form.items"
              :key="idx"
              class="p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--ground)] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
            >
              <input v-model="item.name" type="text" placeholder="Nama item" class="sk-input sm:col-span-6 text-xs h-9" />
              <input v-model.number="item.price" type="number" min="100" step="500" class="sk-input sm:col-span-4 text-xs h-9 num" />
              <button type="button" class="sm:col-span-2 text-xs text-[var(--negative)] font-medium" @click="form.items.splice(idx, 1)">
                Hapus
              </button>
            </div>
          </div>

          <div>
            <p class="text-xs font-medium text-[var(--muted)] mb-1.5">Pilih Peserta Patungan (selain Anda)</p>
            <div class="space-y-1.5 max-h-[170px] overflow-y-auto pr-1">
              <label
                v-for="peer in peers"
                :key="peer.id"
                class="p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--ground)] flex items-center justify-between gap-2 text-sm cursor-pointer"
              >
                <span class="flex items-center gap-2 min-w-0">
                  <input v-model="selectedPhones" type="checkbox" :value="peer.phone_number" class="accent-[var(--accent)]" />
                  <span class="truncate font-medium">{{ peer.full_name }}</span>
                </span>
                <span class="font-mono-id text-xs text-[var(--muted)] shrink-0">{{ peer.phone_number }}</span>
              </label>
            </div>
          </div>

          <button type="submit" class="w-full sk-btn sk-btn-primary">Kirim Tagihan Patungan</button>
        </form>
      </section>

      <section class="lg:col-span-7 space-y-4">
        <div v-if="usableWallets.length" class="sk-card flex flex-wrap items-center justify-between gap-3">
          <label for="sb-pay-wallet" class="text-sm font-medium">Dompet untuk Bayar Tagihan Saya</label>
          <select id="sb-pay-wallet" v-model="payWalletId" class="sk-input sm:w-[290px] text-sm">
            <option v-for="w in usableWallets" :key="w.id" :value="w.id">
              {{ w.name }} — {{ formatRupiah(w.balance) }}
            </option>
          </select>
        </div>

        <div v-for="bill in bills" :key="bill.id" class="sk-card space-y-3.5">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-base font-semibold">{{ bill.title }}</h3>
                <span class="sk-pill sk-pill-neutral">{{ bill.split_mode === 'EQUAL' ? 'Bagi Rata' : 'Per Item' }}</span>
                <span class="sk-pill" :class="bill.status === 'SETTLED' ? 'sk-pill-pos' : 'sk-pill-warn'">
                  {{ bill.status }}
                </span>
              </div>
              <p class="text-xs text-[var(--muted)] mt-0.5">Dibuat oleh {{ bill.creator_name }}</p>
            </div>
            <div class="text-right">
              <p class="text-base font-semibold num">{{ formatRupiah(bill.total_amount) }}</p>
              <p class="text-xs text-[var(--muted)] num">Terkumpul {{ formatRupiah(bill.collected_amount) }}</p>
            </div>
          </div>

          <div class="h-1.5 rounded-full bg-[var(--ground)] overflow-hidden">
            <div class="h-full rounded-full bg-[var(--accent)]" :style="{ width: `${progressPct(bill)}%` }" />
          </div>

          <div class="divide-y divide-[var(--rule)]">
            <div v-for="pt in bill.participants" :key="pt.id" class="py-2 flex items-center justify-between gap-2 text-sm">
              <span class="font-medium">{{ pt.display_name }}</span>
              <div class="flex items-center gap-2.5">
                <span class="num font-semibold">{{ formatRupiah(pt.share_amount) }}</span>
                <span class="sk-pill" :class="pt.status === 'PAID' ? 'sk-pill-pos' : 'sk-pill-warn'">
                  {{ pt.status }}
                </span>
              </div>
            </div>
          </div>

          <div
            v-if="myPendingParticipant(bill)"
            class="pt-2 border-t border-[var(--rule)] flex items-center justify-between gap-3"
          >
            <span class="text-xs text-[var(--muted)]">Bagian Anda belum dibayar</span>
            <button
              type="button"
              class="sk-btn sk-btn-primary min-h-[36px] text-xs"
              @click="payShare(bill, myPendingParticipant(bill)!.share_amount)"
            >
              Bayar Bagian Saya ({{ formatRupiah(myPendingParticipant(bill)!.share_amount) }})
            </button>
          </div>
        </div>

        <div v-if="!bills.length" class="sk-card py-10 text-center text-sm text-[var(--muted)]">
          Belum ada tagihan patungan.
        </div>
      </section>
    </div>
  </div>
</template>

