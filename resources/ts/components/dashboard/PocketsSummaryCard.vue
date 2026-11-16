<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue';
import type { Wallet } from '@/types/sakukilat';
import { formatRupiah, pocketColors } from '@/utils/format';

withDefaults(
  defineProps<{
    pockets: Wallet[];
    loading?: boolean;
  }>(),
  { loading: false }
);

function progressPercent(p: Wallet): number {
  const bal = Number(p.balance ?? 0);
  const target = Number(p.target_amount ?? 0);
  return target > 0 ? Math.min(100, Math.round((bal / target) * 100)) : 0;
}
</script>

<template>
  <section class="sk-card lg:col-span-5 flex flex-col justify-between h-full" aria-label="Ringkasan Kantong Nabung">
    <div>
      <div class="flex items-center justify-between gap-2 mb-3.5">
        <div>
          <h2 class="text-[16px] font-bold">Kantong Nabung</h2>
          <p class="text-[13px] text-[var(--muted)]">Pisahkan anggaran konsumsi, transport &amp; tabungan</p>
        </div>
        <RouterLink to="/pockets" class="text-[13px] font-semibold text-[var(--primary)] hover:underline shrink-0">
          Kelola
        </RouterLink>
      </div>

      <div v-if="loading && !pockets.length" class="py-8 text-center text-sm text-[var(--muted)]">
        Memuat data Kantong Nabung...
      </div>

      <div v-else-if="pockets.length" class="space-y-3">
        <RouterLink
          v-for="pocket in pockets"
          :key="pocket.id"
          to="/pockets"
          class="block p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--container-low)] hover:bg-[var(--container)] transition-colors"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <p class="text-sm font-bold truncate text-[var(--text)]">{{ pocket.name }}</p>
              <span
                class="sk-pill"
                :style="{
                  background: pocketColors(pocket.category_key).bg,
                  color: pocketColors(pocket.category_key).ink,
                }"
              >
                {{ pocketColors(pocket.category_key).label }}
              </span>
            </div>
            <span v-if="pocket.is_locked" class="sk-pill sk-pill-neutral">
              <AppIcon name="lock" size-class="w-3 h-3" />
              <span>Terkunci</span>
            </span>
          </div>

          <div class="mt-2 flex items-baseline justify-between gap-2">
            <span class="text-base font-bold num text-[var(--text)]">{{ formatRupiah(pocket.balance) }}</span>
            <span v-if="Number(pocket.target_amount ?? 0) > 0" class="text-[13px] text-[var(--muted)] num">
              Target {{ formatRupiah(pocket.target_amount) }} ({{ progressPercent(pocket) }}%)
            </span>
          </div>

          <div
            v-if="Number(pocket.target_amount ?? 0) > 0"
            class="mt-2 h-2 w-full rounded-full bg-[var(--surface)] overflow-hidden"
          >
            <div class="h-full rounded-full bg-[var(--primary)]" :style="{ width: `${progressPercent(pocket)}%` }" />
          </div>
        </RouterLink>
      </div>

      <div v-else class="p-6 text-center rounded-[12px] border border-dashed border-[var(--control)]">
        <p class="text-sm text-[var(--muted)]">Belum ada Kantong Nabung di akun ini.</p>
        <RouterLink to="/pockets" class="mt-3 sk-btn sk-btn-primary">Buat Kantong Pertama</RouterLink>
      </div>
    </div>

    <div class="mt-4 pt-3 border-t border-[var(--rule)] flex items-center justify-between text-[13px] text-[var(--muted)]">
      <span>Pindah saldo internal antar kantong</span>
      <span class="font-bold text-[var(--positive)]">Gratis Rp 0</span>
    </div>
  </section>
</template>
