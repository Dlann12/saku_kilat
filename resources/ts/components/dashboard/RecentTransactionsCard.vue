<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue';
import type { TransactionRecord } from '@/types/sakukilat';
import { formatDateTimeWib, signedRupiah } from '@/utils/format';

defineProps<{
  transactions: TransactionRecord[];
}>();

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
      return 'transfer';
  }
}
</script>

<template>
  <section class="sk-card lg:col-span-7 flex flex-col justify-between" aria-label="Transaksi terbaru">
    <div>
      <div class="flex items-center justify-between gap-2 mb-3.5">
        <div>
          <h2 class="text-[16px] font-semibold">Transaksi Terbaru</h2>
          <p class="text-xs text-[var(--muted)]">Klik transaksi untuk melihat Resi Digital &amp; Nomor Referensi</p>
        </div>
        <RouterLink to="/riwayat" class="text-xs font-medium text-[var(--accent)] hover:underline shrink-0">
          Lihat Riwayat
        </RouterLink>
      </div>

      <div v-if="transactions.length" class="divide-y divide-[var(--rule)]">
        <button
          v-for="tx in transactions"
          :key="tx.id"
          type="button"
          class="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left hover:bg-[var(--raised)] -mx-2 px-2 rounded-[10px] transition-colors"
          @click="emit('select', tx)"
        >
          <div class="flex items-center gap-3 min-w-0">
            <AppIcon :name="iconFor(tx.transaction_type)" size-class="w-4 h-4 shrink-0 text-[var(--muted)]" />
            <div class="min-w-0">
              <p class="text-sm font-medium truncate text-[var(--text)]">{{ tx.title }}</p>
              <p class="text-xs text-[var(--faint)] truncate">
                {{ tx.category }} • {{ formatDateTimeWib(tx.created_at) }} WIB
              </p>
            </div>
          </div>
          <div class="text-right shrink-0">
            <p
              class="text-sm font-semibold num"
              :class="tx.direction === 'IN' ? 'text-[var(--positive)]' : 'text-[var(--text)]'"
            >
              {{ signedRupiah(tx.total_amount, tx.direction) }}
            </p>
            <p class="text-[11px] font-mono-id text-[var(--faint)]">{{ tx.status }}</p>
          </div>
        </button>
      </div>

      <p v-else class="py-10 text-center text-sm text-[var(--muted)]">
        Belum ada riwayat transaksi.
      </p>
    </div>

    <div class="mt-4 pt-3 border-t border-[var(--rule)] flex items-center justify-between text-xs text-[var(--muted)]">
      <span>Sumber data</span>
      <span>Ledger Double-Entry Atomik</span>
    </div>
  </section>
</template>

