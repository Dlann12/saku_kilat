<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue';
import type { BiFastQuota } from '@/types/sakukilat';
import { formatRupiah } from '@/utils/format';

withDefaults(
  defineProps<{
    bifastQuota?: BiFastQuota | null;
    monthlyOutflow?: number;
  }>(),
  { bifastQuota: null, monthlyOutflow: 0 }
);

const tiles = [
  { label: 'Pulsa & Data', sub: 'Prabayar', icon: 'phone', to: '/ppob?cat=PULSA' },
  { label: 'Listrik PLN', sub: 'Token & Tagihan', icon: 'zap', to: '/ppob?cat=PLN' },
  { label: 'PDAM Air', sub: 'Tagihan Air', icon: 'droplet', to: '/ppob?cat=PDAM' },
  { label: 'BPJS', sub: 'Kesehatan', icon: 'heart', to: '/ppob?cat=BPJS' },
  { label: 'Games', sub: 'Voucher Digital', icon: 'gamepad', to: '/ppob?cat=GAME' },
  { label: 'Patungan', sub: 'Split Bill', icon: 'users', to: '/split-bill' },
  { label: 'Paket Data', sub: 'Kuota Internet', icon: 'zap', to: '/ppob?cat=DATA' },
  { label: 'Saku Bisnis', sub: 'Merchant QRIS', icon: 'store', to: '/merchant' },
];
</script>

<template>
  <section class="sk-card lg:col-span-5 flex flex-col justify-between h-full" aria-label="Layanan cepat Saku">
    <div>
      <div class="flex items-center justify-between gap-2 mb-3">
        <div>
          <h2 class="text-[16px] font-bold">Layanan Cepat</h2>
          <p class="text-[13px] text-[var(--muted)]">Tagihan PPOB, patungan, hingga kasir QRIS</p>
        </div>
        <RouterLink to="/ppob" class="text-[13px] font-semibold text-[var(--primary)] hover:underline shrink-0">
          Lihat Semua
        </RouterLink>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5">
        <RouterLink
          v-for="tile in tiles"
          :key="tile.label"
          :to="tile.to"
          class="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--container-low)] hover:border-[var(--primary)]/40 px-3 py-2.5 transition-colors flex items-center gap-2.5 min-h-[54px]"
        >
          <AppIcon :name="tile.icon" size-class="w-[18px] h-[18px] text-[var(--primary)] shrink-0" />
          <div class="min-w-0">
            <p class="text-[13px] font-semibold leading-tight text-[var(--text)] truncate">{{ tile.label }}</p>
            <p class="text-xs text-[var(--muted)] truncate">{{ tile.sub }}</p>
          </div>
        </RouterLink>
      </div>
    </div>

    <div class="mt-4 pt-3 border-t border-[var(--rule)] space-y-1.5 text-[13px] text-[var(--muted)]">
      <div class="flex items-center justify-between">
        <span>Total Pengeluaran Tercatat</span>
        <RouterLink to="/riwayat" class="font-bold text-[var(--text)] num hover:text-[var(--primary)]">
          {{ formatRupiah(monthlyOutflow) }}
        </RouterLink>
      </div>
      <div class="flex items-center justify-between">
        <span>Kuota BI-FAST Gratis Bulan Ini</span>
        <span class="font-bold text-[var(--primary)] num">
          {{ bifastQuota?.remaining_free ?? 10 }} / {{ bifastQuota?.free_quota ?? 10 }} tersisa
        </span>
      </div>
    </div>
  </section>
</template>
