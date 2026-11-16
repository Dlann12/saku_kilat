<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { DailySeriesItem } from '@/types/sakukilat';
import { formatRupiah } from '@/utils/format';

const props = defineProps<{
  series: DailySeriesItem[];
}>();

const mode = shallowRef<'out' | 'in'>('out');

const maxVal = computed(() => {
  const vals = props.series.map((d) => (mode.value === 'in' ? d.in_amount : d.out_amount));
  return Math.max(10000, ...vals);
});

const bars = computed(() =>
  props.series.map((day, idx) => {
    const val = mode.value === 'in' ? day.in_amount : day.out_amount;
    const h = val > 0 ? Math.max(4, Math.round((val / maxVal.value) * 145)) : 0;
    return {
      ...day,
      x: 96 + idx * 76,
      h,
      y: 170 - h,
      val,
    };
  })
);
</script>

<template>
  <section class="sk-card lg:col-span-7 flex flex-col justify-between">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div>
        <h2 class="text-[16px] font-semibold">Tren Arus Kas 7 Hari</h2>
        <p class="text-xs text-[var(--muted)]">Ringkasan harian transaksi berstatus SUCCESS</p>
      </div>
      <div class="flex gap-1.5 p-1 rounded-[10px] bg-[var(--ground)] border border-[var(--border)]">
        <button
          type="button"
          class="px-2.5 h-7 rounded-[7px] text-xs font-medium"
          :class="
            mode === 'out'
              ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'
              : 'text-[var(--muted)]'
          "
          @click="mode = 'out'"
        >
          Pengeluaran
        </button>
        <button
          type="button"
          class="px-2.5 h-7 rounded-[7px] text-xs font-medium"
          :class="
            mode === 'in'
              ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'
              : 'text-[var(--muted)]'
          "
          @click="mode = 'in'"
        >
          Pemasukan
        </button>
      </div>
    </div>

    <div class="w-full overflow-hidden">
      <svg viewBox="0 0 640 210" class="w-full h-auto block" role="img" aria-label="Grafik arus kas 7 hari terakhir">
        <line v-for="g in [0, 1, 2, 3]" :key="g" x1="78" :y1="20 + g * 50" x2="624" :y2="20 + g * 50" stroke="#F0F1F3" stroke-width="1" />
        <line x1="78" y1="170" x2="624" y2="170" stroke="#E6E6E6" stroke-width="1" />

        <text x="70" y="24" text-anchor="end" font-size="11" fill="#5C6064">{{ formatRupiah(maxVal) }}</text>
        <text x="70" y="99" text-anchor="end" font-size="11" fill="#5C6064">{{ formatRupiah(maxVal / 2) }}</text>
        <text x="70" y="174" text-anchor="end" font-size="11" fill="#5C6064">Rp 0</text>

        <g v-for="bar in bars" :key="bar.date_iso">
          <rect
            :x="bar.x"
            :y="bar.y"
            width="34"
            :height="bar.h"
            rx="5"
            :fill="mode === 'in' ? '#2F7A45' : '#1D5FD6'"
          >
            <title>{{ bar.label }}: {{ formatRupiah(bar.val) }}</title>
          </rect>
          <text :x="bar.x + 17" y="192" text-anchor="middle" font-size="11" fill="#5C6064">{{ bar.label }}</text>
        </g>
      </svg>
    </div>
  </section>
</template>

