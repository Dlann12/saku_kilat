<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';
import FeatureDisabledNotice from '@/components/common/FeatureDisabledNotice.vue';
import MoneyInput from '@/components/common/MoneyInput.vue';
import { useSessionStore } from '@/stores/session';
import type { TransactionRecord } from '@/types/sakukilat';
import { apiFetch, makeIdempotencyKey } from '@/utils/api';
import { formatRupiah, getInitials } from '@/utils/format';

const route = useRoute();
const store = useSessionStore();

const tab = shallowRef<'p2p' | 'bank'>('p2p');
const errorMsg = shallowRef('');
const loadingContacts = shallowRef(false);
const lookupResult = ref<{ masked_name: string; phone_number: string } | null>(null);
const quickContacts = ref<Array<{ full_name: string; phone_number: string }>>([]);

const nominalPresets = [
  { label: '50 rb', value: 50_000 },
  { label: '100 rb', value: 100_000 },
  { label: '250 rb', value: 250_000 },
  { label: '500 rb', value: 500_000 },
  { label: '1 jt', value: 1_000_000 },
];

const usableWallets = computed(() =>
  (store.walletSummary?.wallets ?? []).filter((w) => ['MAIN', 'POCKET'].includes(w.wallet_type))
);

const bifast = computed(
  () => store.walletSummary?.bifast_quota ?? { used_this_month: 0, free_quota: 10, remaining_free: 10 }
);
const bankFee = computed(() =>
  bifast.value.remaining_free > 0 ? 0 : (store.appConfig.limits.bifast_fee_after_quota ?? 2500)
);

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

const selectedP2pWalletName = computed(
  () => usableWallets.value.find((w) => w.id === p2pForm.walletId)?.name ?? 'Saku Utama'
);
const selectedBankWalletName = computed(
  () => usableWallets.value.find((w) => w.id === bankForm.walletId)?.name ?? 'Saku Utama'
);

async function loadTransfer(): Promise<void> {
  if (!store.user) return;
  loadingContacts.value = true;
  try {
    const [contactRes] = await Promise.all([
      apiFetch<{ contacts: Array<{ full_name: string; phone_number: string }> }>('/api/v1/transfers/contacts'),
      store.fetchWallets(),
    ]);
    quickContacts.value = contactRes.contacts;
    if (usableWallets.value.length) {
      if (!p2pForm.walletId) p2pForm.walletId = usableWallets.value[0].id;
      if (!bankForm.walletId) bankForm.walletId = usableWallets.value[0].id;
    }
  } finally {
    loadingContacts.value = false;
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
  const targetName = lookupResult.value?.masked_name || p2pForm.phone.trim();
  store.requestPin({
    title: 'Konfirmasi Kirim Saldo Saku',
    amount: amt,
    recipientName: targetName,
    recipientSub: p2pForm.phone.trim(),
    adminFee: 0,
    sourceWalletName: selectedP2pWalletName.value,
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
    recipientName: `${bankForm.holderName.trim() || 'Penerima Bank'} (${bankForm.bankCode})`,
    recipientSub: bankForm.accountNumber.trim(),
    adminFee: fee,
    sourceWalletName: selectedBankWalletName.value,
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
        <h1 class="text-[22px] sm:text-[26px] font-bold tracking-tight">Kirim Uang</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Sesama Saku bebas biaya admin atau transfer bank nasional via BI-FAST
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Beranda</RouterLink>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section class="sk-card lg:col-span-7 space-y-5">
        <!-- Segmented Tab: Sesama Saku vs Rekening Bank -->
        <div class="sk-segmented" role="tablist" aria-label="Metode transfer">
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'p2p'"
            class="sk-segmented-btn"
            :class="{ 'is-active': tab === 'p2p' }"
            @click="tab = 'p2p'"
          >
            <AppIcon name="wallet" size-class="w-4 h-4" />
            <span>Sesama Saku</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'bank'"
            class="sk-segmented-btn"
            :class="{ 'is-active': tab === 'bank' }"
            @click="tab = 'bank'"
          >
            <AppIcon name="bank" size-class="w-4 h-4" />
            <span>Rekening Bank</span>
          </button>
        </div>

        <div
          v-if="errorMsg"
          class="p-3.5 rounded-[12px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm font-medium"
        >
          {{ errorMsg }}
        </div>

        <!-- Tab 1: Sesama Saku -->
        <form v-if="tab === 'p2p'" class="space-y-4" @submit.prevent="submitP2p">
          <FeatureDisabledNotice
            :enabled="store.canUse('allow_p2p_transfer')"
            feature-name="Transfer Sesama Saku (P2P)"
          />

          <!-- Input Tujuan Kirim -->
          <div class="p-3.5 rounded-[16px] bg-[var(--container-low)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <span class="w-10 h-10 rounded-[12px] bg-[var(--surface)] text-[var(--primary)] flex items-center justify-center shrink-0">
                <AppIcon name="search" size-class="w-[18px] h-[18px]" />
              </span>
              <div class="flex-1 min-w-0">
                <label for="p2p-phone" class="block text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">
                  Kirim ke Nomor HP / ID Saku
                </label>
                <input
                  id="p2p-phone"
                  v-model="p2pForm.phone"
                  type="tel"
                  required
                  placeholder="+62812..."
                  class="w-full bg-transparent text-sm font-semibold text-[var(--text)] outline-none py-0.5 font-mono-id"
                />
              </div>
            </div>
            <button type="button" class="sk-btn shrink-0" @click="lookupRecipient">
              Cek Penerima
            </button>
          </div>

          <!-- Verified Recipient Badge -->
          <div
            v-if="lookupResult"
            class="p-3.5 rounded-[14px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] flex items-center justify-between gap-3"
          >
            <div class="flex items-center gap-3 min-w-0">
              <span class="w-10 h-10 rounded-full bg-[var(--primary)] text-white font-bold text-xs flex items-center justify-center shrink-0">
                {{ getInitials(lookupResult.masked_name) }}
              </span>
              <div class="min-w-0">
                <p class="text-sm font-bold truncate">{{ lookupResult.masked_name }}</p>
                <p class="text-xs font-mono-id">{{ lookupResult.phone_number }}</p>
              </div>
            </div>
            <span class="sk-pill sk-pill-pos">
              <AppIcon name="verified" size-class="w-3.5 h-3.5" />
              Terverifikasi
            </span>
          </div>

          <!-- Terkini & Favorit Strip -->
          <div v-if="quickContacts.length">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-[var(--variant)]">Terkini &amp; Favorit</span>
              <span class="text-xs text-[var(--muted)]">Ketuk untuk pilih</span>
            </div>
            <div class="sk-scroll-x gap-2.5 pb-1">
              <button
                v-for="contact in quickContacts"
                :key="contact.phone_number"
                type="button"
                class="min-w-[78px] max-w-[92px] min-h-[44px] p-2 rounded-[14px] border flex flex-col items-center gap-1.5 transition-colors shrink-0"
                :class="
                  p2pForm.phone === contact.phone_number
                    ? 'bg-[var(--accent-soft)] border-[var(--primary)] text-[var(--accent-ink)]'
                    : 'bg-[var(--container-low)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--container)]'
                "
                @click="
                  p2pForm.phone = contact.phone_number;
                  void lookupRecipient();
                "
              >
                <span
                  class="w-10 h-10 rounded-full text-xs font-bold flex items-center justify-center"
                  :class="
                    p2pForm.phone === contact.phone_number
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--surface)] text-[var(--primary)]'
                  "
                >
                  {{ getInitials(contact.full_name) }}
                </span>
                <span class="text-[11px] font-semibold truncate w-full text-center">
                  {{ contact.full_name.split(' ')[0] }}
                </span>
              </button>
            </div>
          </div>

          <div v-else-if="loadingContacts" class="text-xs text-[var(--muted)]">
            Memuat daftar kontak...
          </div>

          <!-- Big Nominal Input + Quick Chips -->
          <div class="p-4 rounded-[16px] bg-[var(--container-low)] border border-[var(--border)] space-y-3">
            <div class="flex items-center justify-between">
              <label for="p2p-amount" class="text-xs font-bold text-[var(--variant)]">
                Nominal Kirim
              </label>
              <span class="text-xs font-semibold text-[var(--primary)]">Admin Rp 0</span>
            </div>

            <MoneyInput id="p2p-amount" v-model="p2pForm.amount" />

            <div class="flex flex-wrap gap-2">
              <button
                v-for="preset in nominalPresets"
                :key="preset.value"
                type="button"
                class="min-h-[38px] px-3 rounded-full text-xs font-semibold border transition-colors"
                :class="
                  p2pForm.amount === preset.value
                    ? 'bg-[var(--primary)] text-white border-transparent'
                    : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--container)]'
                "
                @click="p2pForm.amount = preset.value"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="p2p-wallet" class="block text-xs font-semibold text-[var(--muted)] mb-1.5">
                Sumber Dana
              </label>
              <select id="p2p-wallet" v-model="p2pForm.walletId" class="sk-input text-sm">
                <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                  {{ w.name }} - {{ formatRupiah(w.balance) }}{{ w.is_locked ? ' (Terkunci)' : '' }}
                </option>
              </select>
            </div>

            <div>
              <label for="p2p-notes" class="block text-xs font-semibold text-[var(--muted)] mb-1.5">
                Catatan (Opsional)
              </label>
              <input
                id="p2p-notes"
                v-model="p2pForm.notes"
                type="text"
                placeholder="Bayar makan siang / iuran"
                class="sk-input text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            :disabled="!store.canUse('allow_p2p_transfer')"
            class="w-full sk-btn sk-btn-primary"
          >
            <AppIcon name="send" />
            <span>Kirim Saldo Sekarang (PIN)</span>
          </button>
        </form>

        <!-- Tab 2: Rekening Bank (BI-FAST) -->
        <div v-else class="space-y-4">
          <FeatureDisabledNotice
            :enabled="store.canUse('allow_bank_transfer')"
            feature-name="Transfer Rekening Bank (BI-FAST)"
          />

          <div
            v-if="store.user?.kyc_status !== 'VERIFIED'"
            class="p-4 rounded-[14px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] space-y-2"
          >
            <p class="text-sm font-bold">Transfer Bank BI-FAST Memerlukan Akun Saku Plus (KYC)</p>
            <p class="text-xs leading-relaxed">
              Selesaikan verifikasi e-KTP di halaman Profil untuk membuka fitur transfer rekening bank.
            </p>
            <RouterLink to="/profil" class="sk-btn min-h-[38px] text-xs inline-flex">
              Verifikasi e-KTP Sekarang
            </RouterLink>
          </div>

          <form class="space-y-4" @submit.prevent="submitBank">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="bank-code" class="block text-xs font-semibold text-[var(--muted)] mb-1.5">
                  Bank Tujuan
                </label>
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
                <label for="bank-account" class="block text-xs font-semibold text-[var(--muted)] mb-1.5">
                  Nomor Rekening
                </label>
                <input
                  id="bank-account"
                  v-model="bankForm.accountNumber"
                  type="text"
                  inputmode="numeric"
                  required
                  placeholder="1234567890"
                  class="sk-input font-mono-id text-sm"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="bank-holder" class="block text-xs font-semibold text-[var(--muted)] mb-1.5">
                  Nama Pemilik Rekening
                </label>
                <input
                  id="bank-holder"
                  v-model="bankForm.holderName"
                  type="text"
                  required
                  placeholder="Nama lengkap sesuai buku tabungan"
                  class="sk-input text-sm"
                />
              </div>

              <div>
                <label for="bank-wallet" class="block text-xs font-semibold text-[var(--muted)] mb-1.5">
                  Sumber Dana
                </label>
                <select id="bank-wallet" v-model="bankForm.walletId" class="sk-input text-sm">
                  <option v-for="w in usableWallets" :key="w.id" :value="w.id">
                    {{ w.name }} - {{ formatRupiah(w.balance) }}
                  </option>
                </select>
              </div>
            </div>

            <div class="p-4 rounded-[16px] bg-[var(--container-low)] border border-[var(--border)] space-y-3">
              <label for="bank-amount" class="block text-xs font-bold text-[var(--variant)]">
                Nominal Transfer (Min Rp 10.000)
              </label>
              <MoneyInput id="bank-amount" v-model="bankForm.amount" :min="10000" />
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="preset in nominalPresets"
                  :key="`bank-${preset.value}`"
                  type="button"
                  class="min-h-[38px] px-3 rounded-full text-xs font-semibold border transition-colors"
                  :class="
                    bankForm.amount === preset.value
                      ? 'bg-[var(--primary)] text-white border-transparent'
                      : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--container)]'
                  "
                  @click="bankForm.amount = preset.value"
                >
                  {{ preset.label }}
                </button>
              </div>
            </div>

            <div class="p-3.5 rounded-[14px] bg-[var(--container-low)] border border-[var(--border)] space-y-1.5 text-sm">
              <div class="flex justify-between">
                <span class="text-[var(--muted)]">Biaya Admin BI-FAST</span>
                <span class="font-semibold num" :class="bankFee === 0 ? 'text-[var(--positive)]' : ''">
                  {{ bankFee === 0 ? 'Gratis (Kuota Bulan Ini)' : formatRupiah(bankFee) }}
                </span>
              </div>
              <div class="flex justify-between font-bold">
                <span>Total Terdebit</span>
                <span class="text-[var(--primary)] num">{{ formatRupiah(bankForm.amount + bankFee) }}</span>
              </div>
            </div>

            <button
              type="submit"
              :disabled="!store.canUse('allow_bank_transfer') || store.user?.kyc_status !== 'VERIFIED'"
              class="w-full sk-btn sk-btn-primary"
            >
              <AppIcon name="bank" />
              <span>Transfer ke Rekening Bank (PIN)</span>
            </button>
          </form>
        </div>
      </section>

      <!-- Quota & Rules Card -->
      <aside class="sk-card lg:col-span-5 space-y-4">
        <h2 class="text-[16px] font-bold">Ringkasan Kuota &amp; Aturan Transfer</h2>
        <div class="p-4 rounded-[14px] bg-[var(--container-low)] border border-[var(--border)] space-y-2.5">
          <div class="flex items-center justify-between text-sm">
            <span class="text-[var(--muted)]">Kuota Gratis BI-FAST</span>
            <span class="font-bold num text-[var(--primary)]">
              {{ bifast.remaining_free }} / {{ bifast.free_quota }}
            </span>
          </div>
          <div class="h-2 rounded-full bg-[var(--surface)] overflow-hidden">
            <div
              class="h-full rounded-full bg-[var(--primary)]"
              :style="{ width: `${Math.min(100, Math.round((bifast.remaining_free / Math.max(1, bifast.free_quota)) * 100))}%` }"
            />
          </div>
          <p class="text-xs text-[var(--muted)]">
            {{ bifast.free_quota }}x pertama per bulan kalender bebas admin (Rp 0). Berikutnya
            {{ formatRupiah(store.appConfig.limits.bifast_fee_after_quota ?? 2500) }}.
          </p>
        </div>

        <ul class="space-y-2.5 text-xs text-[var(--variant)] leading-relaxed">
          <li>• Transfer sesama Saku (P2P) selalu Rp 0 dan langsung masuk secara atomik.</li>
          <li>• Kantong Nabung yang terkunci tidak bisa dipakai sebagai sumber dana keluar.</li>
          <li>• Setiap kirim dana menggunakan Idempotency-Key untuk mencegah debit ganda.</li>
        </ul>
      </aside>
    </div>
  </div>
</template>
