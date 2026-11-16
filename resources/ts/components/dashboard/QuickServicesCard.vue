<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue';
import type { BiFastQuota } from '@/types/sakukilat';

withDefaults(
  defineProps<{
    bifastQuota?: BiFastQuota | null;
  }>(),
  { bifastQuota: null }
);

const tiles = [
  { label: 'Pulsa', sub: 'All Operator', icon: 'phone', to: '/ppob?cat=PULSA' },
  { label: 'Paket Data', sub: 'Internet', icon: 'zap', to: '/ppob?cat=DATA' },
  { label: 'Token PLN', sub: 'Listrik', icon: 'zap', to: '/ppob?cat=PLN' },
  { label: 'PDAM', sub: 'Air Bersih', icon: 'droplet', to: '/ppob?cat=PDAM' },
  { label: 'BPJS', sub: 'Kesehatan', icon: 'heart', to: '/ppob?cat=BPJS' },
  { label: 'Patungan', sub: 'Split Bill', icon: 'users', to: '/split-bill' },
];
</script>

<template>
  <section class="sk-card lg:col-span-5 flex flex-col justify-between" aria-label="Layanan cepat dan PPOB">
    <div>
      <div class="flex items-center justify-between gap-2 mb-3.5">
        <div>
          <h2 class="text-[16px] font-semibold">Tagihan &amp; Layanan Cepat</h2>
          <p class="text-xs text-[var(--muted)]">Pulsa, listrik, air, hingga patungan</p>
        </div>
        <RouterLink to="/ppob" class="text-xs font-medium text-[var(--accent)] hover:underline shrink-0">
          Semua Produk
        </RouterLink>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <RouterLink
          v-for="tile in tiles"
          :key="tile.label"
          :to="tile.to"
          class="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] px-3 py-2.5 transition-colors flex flex-col justify-between gap-1.5 min-h-[64px]"
        >
          <AppIcon :name="tile.icon" size-class="w-4 h-4 text-[var(--accent)]" />
          <div>
            <p class="text-[13px] font-semibold leading-tight text-[var(--text)]">{{ tile.label }}</p>
            <p class="text-[11px] text-[var(--faint)]">{{ tile.sub }}</p>
          </div>
        </RouterLink>
      </div>
    </div>

    <div class="mt-4 pt-3 border-t border-[var(--rule)] flex items-center justify-between text-xs text-[var(--muted)]">
      <span>Kuota BI-FAST Gratis Bulan Ini</span>
      <span class="font-semibold text-[var(--text)] num">
        {{ bifastQuota?.remaining_free ?? 10 }} / {{ bifastQuota?.free_quota ?? 10 }} tersisa
      </span>
    </div>
  </section>
</template>

