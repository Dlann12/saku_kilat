<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue';
import type { TransactionRecord } from '@/types/sakukilat';
import { formatDateTimeWib, signedRupiah } from '@/utils/format';

withDefaults(
  defineProps<{
    transactions: TransactionRecord[];
    loading?: boolean;
  }>(),
  { loading: false }
);

const emit = defineEmits<{
  select: [tx: TransactionRecord];
}>();

function iconFor(type: string): string {
  switch (type) {
    case 'TOPUP':
      return 'plus';
    case 'QRIS':
      return 'qris';
    case 'PPOB':
      return 'zap';
    case 'SPLIT_BILL':
      return 'users';
    case 'MERCHANT_SETTLE':
      return 'store';
    case 'REVERSAL':
      return 'history';
    default:
      return 'send';
  }
}
</script>

<template>
  <section class="sk-card lg:col-span-7 flex flex-col justify-between h-full" aria-label="Transaksi terakhir">
    <div>
      <div class="flex items-center justify-between gap-2 mb-3.5">
        <div>
          <h2 class="text-[16px] font-bold">Transaksi Terbaru</h2>
          <p class="text-[13px] text-[var(--muted)]">Pilih transaksi untuk membuka e-Resi &amp; Nomor Referensi</p>
        </div>
        <RouterLink to="/riwayat" class="text-[13px] font-semibold text-[var(--primary)] hover:underline shrink-0">
          Lihat Semua
        </RouterLink>
      </div>

      <div v-if="loading && !transactions.length" class="py-10 text-center text-sm text-[var(--muted)]">
        Memuat mutasi transaksi terbaru...
      </div>

      <div v-else-if="transactions.length" class="divide-y divide-[var(--rule)]">
        <button
          v-for="tx in transactions"
          :key="tx.id"
          type="button"
          class="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left hover:bg-[var(--container-low)] -mx-2 px-2 rounded-[12px] transition-colors"
          @click="emit('select', tx)"
        >
          <div class="flex items-center gap-3 min-w-0">
            <AppIcon :name="iconFor(tx.transaction_type)" size-class="w-[18px] h-[18px] text-[var(--primary)] shrink-0" />
            <div class="min-w-0">
              <p class="text-sm font-semibold truncate text-[var(--text)]">{{ tx.title }}</p>
              <p class="text-[13px] text-[var(--muted)] truncate">
                {{ tx.category }} • {{ formatDateTimeWib(tx.created_at) }} WIB
              </p>
            </div>
          </div>
          <div class="text-right shrink-0">
            <p
              class="text-sm font-bold num"
              :class="tx.direction === 'IN' ? 'text-[var(--positive)]' : 'text-[var(--text)]'"
            >
              {{ signedRupiah(tx.total_amount, tx.direction) }}
            </p>
            <p class="text-xs font-semibold text-[var(--muted)]">{{ tx.status }}</p>
          </div>
        </button>
      </div>

      <p v-else class="py-10 text-center text-sm text-[var(--muted)]">
        Belum ada riwayat transaksi. Mulai dengan Top Up atau Bayar QRIS.
      </p>
    </div>

    <div class="mt-4 pt-3 border-t border-[var(--rule)] flex items-center justify-between text-[13px] text-[var(--muted)]">
      <span>Sumber catatan</span>
      <span>Ledger Double-Entry SakuKilat</span>
    </div>
  </section>
</template>
