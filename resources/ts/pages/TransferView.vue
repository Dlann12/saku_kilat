<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import MoneyInput from '@/components/common/MoneyInput.vue';
import { useSessionStore } from '@/stores/session';
import type { TransactionRecord } from '@/types/sakukilat';
import { apiFetch, makeIdempotencyKey } from '@/utils/api';
import { formatRupiah } from '@/utils/format';

const route = useRoute();
const store = useSessionStore();

const tab = shallowRef<'p2p' | 'bank'>('p2p');
const errorMsg = shallowRef('');
const lookupResult = ref<{ masked_name: string; phone_number: string } | null>(null);
const quickContacts = ref<Array<{ full_name: string; phone_number: string }>>([]);

const usableWallets = computed(() =>
  (store.walletSummary?.wallets ?? []).filter((w) => ['MAIN', 'POCKET'].includes(w.wallet_type))
);

const bifast = computed(
  () => store.walletSummary?.bifast_quota ?? { used_this_month: 0, free_quota: 10, remaining_free: 10 }
);
const bankFee = computed(() => (bifast.value.remaining_free > 0 ? 0 : 2500));

const p2pForm = reactive({
  phone: typeof route.query.phone === 'string' && route.query.phone ? route.query.phone : '+6281234567890',
  walletId: '',
  amount: 50000,
  notes: '',
});

const bankForm = reactive({
  bankCode: 'BCA',
  accountNumber: '',
  holderName: '',
  walletId: '',
  amount: 100000,
});

async function loadTransfer(): Promise<void> {
  if (!store.user) return;
  const [contactRes] = await Promise.all([
    apiFetch<{ contacts: Array<{ full_name: string; phone_number: string }> }>('/api/v1/transfers/contacts'),
    store.fetchWallets(),
  ]);
  quickContacts.value = contactRes.contacts;
  if (usableWallets.value.length) {
    if (!p2pForm.walletId) p2pForm.walletId = usableWallets.value[0].id;
    if (!bankForm.walletId) bankForm.walletId = usableWallets.value[0].id;
  }
}

watch(() => store.user?.id, () => void loadTransfer(), { immediate: true });

async function lookupRecipient(): Promise<void> {
  errorMsg.value = '';
  try {
    lookupResult.value = await apiFetch<{ masked_name: string; phone_number: string }>(
      `/api/v1/transfers/lookup?phone=${encodeURIComponent(p2pForm.phone.trim())}`
    );
  } catch (err) {
    lookupResult.value = null;
    errorMsg.value = err instanceof Error ? err.message : 'Penerima tidak ditemukan.';
  }
}

function submitP2p(): void {
  errorMsg.value = '';
  const idempotencyKey = makeIdempotencyKey('p2p');
  const amt = p2pForm.amount;
  store.requestPin({
    title: 'Konfirmasi Transfer Sesama SakuKilat',
    amount: amt,
    onAuthorized: async (txAuthToken) => {
      try {
        const tx = await apiFetch<TransactionRecord>('/api/v1/transfers/p2p', {
          method: 'POST',
          idempotencyKey,
          body: {
            recipient_phone: p2pForm.phone.trim(),
            source_wallet_id: p2pForm.walletId,
            amount: amt,
            notes: p2pForm.notes.trim(),
            tx_auth_token: txAuthToken,
          },
        });
        await store.fetchWallets();
        store.openReceipt(tx);
      } catch (err) {
        errorMsg.value = err instanceof Error ? err.message : 'Transfer P2P gagal.';
      }
    },
  });
}

function submitBank(): void {
  errorMsg.value = '';
  const idempotencyKey = makeIdempotencyKey('bank');
  const amt = bankForm.amount;
  const fee = bankFee.value;
  store.requestPin({
    title: 'Konfirmasi Transfer Bank BI-FAST',
    amount: amt + fee,
    onAuthorized: async (txAuthToken) => {
      try {
        const tx = await apiFetch<TransactionRecord>('/api/v1/transfers/bank', {
          method: 'POST',
          idempotencyKey,
          body: {
            bank_code: bankForm.bankCode,
            account_number: bankForm.accountNumber.trim(),
            account_holder_name: bankForm.holderName.trim(),
            source_wallet_id: bankForm.walletId,
            amount: amt,
            tx_auth_token: txAuthToken,
          },
        });
        await store.fetchWallets();
        store.openReceipt(tx);
      } catch (err) {
        errorMsg.value = err instanceof Error ? err.message : 'Transfer bank gagal.';
      }
    },
  });
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Transfer Dana</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Kirim ke sesama pengguna SakuKilat Rp 0 atau transfer rekening bank BI-FAST
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Kembali</RouterLink>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="sk-card lg:col-span-7 space-y-5">
        <div class="flex gap-2 p-1 rounded-[12px] bg-[var(--ground)] border border-[var(--border)]">
          <button
            type="button"
            class="flex-1 h-9 rounded-[9px] text-sm font-medium"
            :class="tab === 'p2p' ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]' : 'text-[var(--muted)]'"
            @click="tab = 'p2p'"
          >
            Sesama SakuKilat (Rp 0)
          </button>
          <button
            type="button"
            class="flex-1 h-9 rounded-[9px] text-sm font-medium"
            :class="tab === 'bank' ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]' : 'text-[var(--muted)]'"
            @click="tab = 'bank'"
          >
            Rekening Bank (BI-FAST)
          </button>
        </div>

        <div v-if="errorMsg" class="p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {{ errorMsg }}
        </div>

        <form v-if="tab === 'p2p'" class="space-y-4" @submit.prevent="submitP2p">
          <div v-if="quickContacts.length">
            <p class="text-xs font-medium text-[var(--muted)] mb-2">Kontak Cepat Terdaftar</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="contact in quickContacts"
                :key="contact.phone_number"
                type="button"
                class="sk-btn min-h-[34px] px-3 text-xs"
                @click="p2pForm.phone = contact.phone_number; void lookupRecipient()"
              >
                {{ contact.full_name }}
              </button>
            </div>
          </div>

          <div>
            <label for="p2p-phone" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nomor HP Penerima</label>
            <div class="flex flex-col sm:flex-row gap-2">
              <input id="p2p-phone" v-model="p2pForm.phone" type="tel" required class="sk-input" />
              <button type="button" class="sk-btn shrink-0" @click="lookupRecipient">Cek Penerima</button>
            </div>
            <div
              v-if="lookupResult"
              class="mt-2 p-3 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-xs font-medium"
            >
              Penerima Terverifikasi: {{ lookupResult.masked_name }} ({{ lookupResult.phone_number }})
            </div>
          </div>

          <div>
            <label for="p2p-wallet" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Sumber Dana</label>
            <select id="p2p-wallet" v-model="p2pForm.walletId" class="sk-input text-sm">
              <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                {{ w.name }} — {{ formatRupiah(w.balance) }}{{ w.is_locked ? ' (Terkunci)' : '' }}
              </option>
            </select>
          </div>

          <div>
            <label for="p2p-amount" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nominal Kirim</label>
            <MoneyInput id="p2p-amount" v-model="p2pForm.amount" />
          </div>

          <div>
            <label for="p2p-notes" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Catatan (Opsional)</label>
            <input id="p2p-notes" v-model="p2pForm.notes" type="text" placeholder="Bayar makan siang / iuran" class="sk-input text-sm" />
          </div>

          <button type="submit" class="w-full sk-btn sk-btn-primary">Kirim Saldo Sekarang (PIN)</button>
        </form>

        <div v-else class="space-y-4">
          <div
            v-if="store.user?.kyc_status !== 'VERIFIED'"
            class="p-4 rounded-[12px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] space-y-2"
          >
            <p class="text-sm font-semibold">Transfer Bank BI-FAST Memerlukan Akun SakuKilat Plus (KYC)</p>
            <p class="text-xs leading-relaxed">
              Untuk keamanan dan regulasi Bank Indonesia, silakan selesaikan verifikasi e-KTP di halaman Profil terlebih dahulu.
            </p>
            <RouterLink to="/profil" class="sk-btn min-h-[34px] text-xs inline-flex">Verifikasi e-KTP Sekarang</RouterLink>
          </div>

          <form class="space-y-4" @submit.prevent="submitBank">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="bank-code" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Bank Tujuan</label>
                <select id="bank-code" v-model="bankForm.bankCode" class="sk-input text-sm">
                  <option value="BCA">Bank BCA</option>
                  <option value="MANDIRI">Bank Mandiri</option>
                  <option value="BNI">Bank BNI</option>
                  <option value="BRI">Bank BRI</option>
                  <option value="BSI">Bank Syariah Indonesia (BSI)</option>
                  <option value="CIMB">CIMB Niaga</option>
                  <option value="JAGO">Bank Jago</option>
                  <option value="SEABANK">SeaBank Indonesia</option>
                </select>
              </div>
              <div>
                <label for="bank-account" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nomor Rekening</label>
                <input id="bank-account" v-model="bankForm.accountNumber" type="text" inputmode="numeric" required class="sk-input font-mono-id text-sm" />
              </div>
            </div>

            <div>
              <label for="bank-holder" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nama Pemilik Rekening</label>
              <input id="bank-holder" v-model="bankForm.holderName" type="text" required class="sk-input text-sm" />
            </div>

            <div>
              <label for="bank-wallet" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Sumber Dana</label>
              <select id="bank-wallet" v-model="bankForm.walletId" class="sk-input text-sm">
                <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                  {{ w.name }} — {{ formatRupiah(w.balance) }}
                </option>
              </select>
            </div>

            <div>
              <label for="bank-amount" class="block text-xs font-medium text-[var(--muted)] mb-1.5">
                Nominal Transfer (Min Rp 10.000)
              </label>
              <MoneyInput id="bank-amount" v-model="bankForm.amount" :min="10000" />
            </div>

            <div class="p-3.5 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-1.5 text-sm">
              <div class="flex justify-between">
                <span class="text-[var(--muted)]">Biaya Admin BI-FAST</span>
                <span class="font-semibold num" :class="bankFee === 0 ? 'text-[var(--positive)]' : ''">
                  {{ bankFee === 0 ? 'Gratis (Kuota Bulan Ini)' : formatRupiah(bankFee) }}
                </span>
              </div>
              <div class="flex justify-between font-semibold">
                <span>Total Terdebit</span>
                <span class="text-[var(--accent)] num">{{ formatRupiah(bankForm.amount + bankFee) }}</span>
              </div>
            </div>

            <button
              type="submit"
              :disabled="store.user?.kyc_status !== 'VERIFIED'"
              class="w-full sk-btn sk-btn-primary"
            >
              Transfer ke Rekening Bank (PIN)
            </button>
          </form>
        </div>
      </section>

      <aside class="sk-card lg:col-span-5 space-y-4">
        <h2 class="text-[16px] font-semibold">Ringkasan Kuota &amp; Aturan Transfer</h2>
        <div class="p-4 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-[var(--muted)]">Kuota Gratis BI-FAST</span>
            <span class="font-semibold num">{{ bifast.remaining_free }} / {{ bifast.free_quota }}</span>
          </div>
          <div class="h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
            <div
              class="h-full rounded-full bg-[var(--accent)]"
              :style="{ width: `${Math.min(100, Math.round((bifast.remaining_free / Math.max(1, bifast.free_quota)) * 100))}%` }"
            />
          </div>
          <p class="text-xs text-[var(--muted)]">
            10x pertama tiap bulan kalender Rp 0. Transaksi ke-11 dst dikenakan Rp 2.500.
          </p>
        </div>
        <ul class="space-y-2 text-xs text-[var(--muted)] leading-relaxed">
          <li>• Transfer sesama SakuKilat (P2P) selalu bebas biaya Rp 0 dengan nama penerima tersamar.</li>
          <li>• Saldo Kantong Pintar yang terkunci dilindungi dari penarikan otomatis.</li>
          <li>• Setiap eksekusi dilindungi idempotency key sehingga klik ganda tidak mendebit dua kali.</li>
        </ul>
      </aside>
    </div>
  </div>
</template>

