<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useSessionStore } from '@/stores/session';
import type { AdminOverview } from '@/types/sakukilat';
import { apiFetch } from '@/utils/api';
import { formatDateTimeWib, formatRupiah } from '@/utils/format';

const store = useSessionStore();
const overview = ref<AdminOverview | null>(null);
const errorMsg = shallowRef('');

const isAdmin = computed(() => store.user?.role === 'ADMIN');
const adminPersona = computed(() => store.demoPersonas.find((p) => p.role === 'ADMIN'));

async function loadAdmin(): Promise<void> {
  if (!store.user) return;
  overview.value = await apiFetch<AdminOverview>('/api/v1/admin/overview');
}

watch(() => store.user?.id, () => void loadAdmin(), { immediate: true });

async function reviewKyc(docId: string, decision: 'VERIFIED' | 'REJECTED'): Promise<void> {
  errorMsg.value = '';
  try {
    await apiFetch(`/api/v1/admin/kyc/${docId}/review`, {
      method: 'POST',
      body: {
        decision,
        rejection_reason: decision === 'REJECTED' ? 'Dokumen tidak terbaca saat audit' : null,
      },
    });
    await loadAdmin();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memperbarui KYC.';
  }
}

async function reverseTx(txId: string): Promise<void> {
  errorMsg.value = '';
  try {
    await apiFetch(`/api/v1/admin/transactions/${txId}/reverse`, {
      method: 'POST',
      body: { reason: 'Koreksi / Rekonsiliasi Compliance' },
    });
    await loadAdmin();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Auto-reversal gagal.';
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">
          Admin Kepatuhan &amp; Audit Buku Besar
        </h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">
          Verifikasi e-KTP, pembuktian Double-Entry Zero-Discrepancy, Outbox Event &amp; Auto-Reversal
        </p>
      </div>
      <RouterLink to="/" class="sk-btn">Beranda</RouterLink>
    </div>

    <div
      v-if="!isAdmin && adminPersona"
      class="mb-5 p-4 rounded-[14px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] flex flex-wrap items-center justify-between gap-3"
    >
      <div class="text-sm">
        Anda sedang dalam mode baca. Beralihlah ke akun <strong>{{ adminPersona.full_name }}</strong> untuk menyetujui KYC atau mengeksekusi Auto-Reversal.
      </div>
      <button type="button" class="sk-btn min-h-[34px] text-xs" @click="store.switchDemoPersona(adminPersona.id)">
        Masuk sebagai {{ adminPersona.full_name }}
      </button>
    </div>

    <div v-if="overview" class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
      <div class="sk-card">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-[var(--muted)]">Status Invariant Double-Entry</p>
          <span class="sk-pill" :class="overview.ledger_invariant.balanced ? 'sk-pill-pos' : 'sk-pill-neg'">
            {{ overview.ledger_invariant.balanced ? 'SEIMBANG (0 SELISIH)' : 'SELISIH TERDETEKSI' }}
          </span>
        </div>
        <p class="mt-2 text-lg font-semibold num">{{ overview.ledger_invariant.total_entries }} Baris Jurnal</p>
        <p class="text-xs text-[var(--muted)] num mt-0.5">
          Debit = Kredit = {{ formatRupiah(overview.ledger_invariant.total_debit) }}
        </p>
      </div>

      <div v-for="sw in overview.system_wallets.slice(0, 2)" :key="sw.id" class="sk-card">
        <p class="text-xs text-[var(--muted)]">{{ sw.name }}</p>
        <p class="mt-2 text-xl font-semibold num">{{ formatRupiah(sw.balance) }}</p>
        <p class="text-[11px] font-mono-id text-[var(--faint)] mt-0.5">{{ sw.wallet_type }}</p>
      </div>
    </div>

    <div v-if="errorMsg" class="mb-4 p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
      {{ errorMsg }}
    </div>

    <div v-if="overview" class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start mb-5">
      <section class="sk-card lg:col-span-6 space-y-3">
        <div>
          <h2 class="text-[16px] font-semibold">Antrean Verifikasi e-KTP (KYC)</h2>
          <p class="text-xs text-[var(--muted)]">Setujui untuk mengaktifkan limit Rp 20 juta dan BI-FAST</p>
        </div>

        <div class="divide-y divide-[var(--rule)]">
          <div
            v-for="doc in overview.kyc_queue"
            :key="doc.id"
            class="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold truncate">{{ doc.full_name_ktp }}</p>
                <span
                  class="sk-pill"
                  :class="doc.status === 'VERIFIED' ? 'sk-pill-pos' : doc.status === 'PENDING' ? 'sk-pill-warn' : 'sk-pill-neg'"
                >
                  {{ doc.status }}
                </span>
              </div>
              <p class="font-mono-id text-xs text-[var(--muted)] mt-0.5">{{ doc.user?.phone_number || '-' }}</p>
            </div>
            <div v-if="doc.status === 'PENDING'" class="flex gap-2">
              <button
                type="button"
                :disabled="!isAdmin"
                class="sk-btn sk-btn-primary min-h-[32px] px-3 text-xs"
                @click="reviewKyc(doc.id, 'VERIFIED')"
              >
                Setujui
              </button>
              <button
                type="button"
                :disabled="!isAdmin"
                class="sk-btn min-h-[32px] px-3 text-xs text-[var(--negative)]"
                @click="reviewKyc(doc.id, 'REJECTED')"
              >
                Tolak
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="sk-card lg:col-span-6 space-y-3">
        <div>
          <h2 class="text-[16px] font-semibold">Transaksi &amp; Kontrol Auto-Reversal</h2>
          <p class="text-xs text-[var(--muted)]">
            Jurnal pembalik atomik mengembalikan saldo tanpa mengubah histori asli
          </p>
        </div>

        <div class="divide-y divide-[var(--rule)] max-h-[340px] overflow-y-auto">
          <div v-for="rtx in overview.recent_transactions" :key="rtx.id" class="py-2.5 flex items-center justify-between gap-2 text-xs">
            <div class="min-w-0">
              <p class="font-medium truncate text-[var(--text)]">{{ rtx.title }}</p>
              <p class="font-mono-id text-[11px] text-[var(--faint)]">
                {{ rtx.reference_number }} • {{ rtx.user?.full_name }}
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="num font-semibold">{{ formatRupiah(rtx.total_amount) }}</span>
              <button
                v-if="rtx.status === 'SUCCESS'"
                type="button"
                :disabled="!isAdmin"
                class="sk-btn min-h-[30px] px-2.5 text-[11px]"
                @click="reverseTx(rtx.id)"
              >
                Reverse
              </button>
              <span v-else class="sk-pill sk-pill-warn">{{ rtx.status }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section v-if="overview" class="sk-card space-y-3 mb-5">
      <div>
        <h2 class="text-[16px] font-semibold">Jurnal Buku Besar Terbaru (Append-Only Ledger)</h2>
        <p class="text-xs text-[var(--muted)]">Dilindungi trigger SQL agar entri tidak pernah dapat diubah atau dihapus</p>
      </div>

      <div class="overflow-x-auto">
        <table class="sk-table">
          <thead>
            <tr>
              <th>Referensi</th>
              <th>Dompet</th>
              <th>Tipe</th>
              <th class="num">Nominal</th>
              <th class="num">Saldo Akhir</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="le in overview.recent_ledger_entries" :key="le.id">
              <td class="font-mono-id text-xs">{{ le.transaction?.reference_number || '-' }}</td>
              <td class="text-xs font-medium">{{ le.wallet?.name || '-' }}</td>
              <td>
                <span class="sk-pill" :class="le.entry_type === 'CREDIT' ? 'sk-pill-pos' : 'sk-pill-neutral'">
                  {{ le.entry_type }}
                </span>
              </td>
              <td class="num font-semibold">{{ formatRupiah(le.amount) }}</td>
              <td class="num text-xs text-[var(--muted)]">{{ formatRupiah(le.running_balance) }}</td>
              <td class="text-xs text-[var(--muted)]">{{ le.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="overview" class="sk-card space-y-3">
      <div>
        <h2 class="text-[16px] font-semibold">Aliran Event Outbox (Transactional Outbox Pattern)</h2>
        <p class="text-xs text-[var(--muted)]">
          Jejak event domain atomik untuk keandalan pengiriman webhook &amp; notifikasi
        </p>
      </div>

      <div class="overflow-x-auto">
        <table class="sk-table">
          <thead>
            <tr>
              <th>Topik Event</th>
              <th>Aggregate ID</th>
              <th>Status</th>
              <th>Waktu</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ev in overview.outbox_events" :key="ev.id">
              <td class="font-mono-id text-xs font-medium">{{ ev.topic }}</td>
              <td class="font-mono-id text-xs text-[var(--muted)]">{{ String(ev.aggregate_id).slice(0, 12) }}</td>
              <td><span class="sk-pill sk-pill-neutral">{{ ev.status }}</span></td>
              <td class="text-xs text-[var(--muted)]">{{ formatDateTimeWib(ev.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

