<script setup lang="ts">
const model = defineModel<number>({ required: true });

withDefaults(
  defineProps<{
    id?: string;
    min?: number;
    max?: number;
    step?: number;
    readonly?: boolean;
    required?: boolean;
  }>(),
  {
    min: 1000,
    max: 20000000,
    step: 1000,
    readonly: false,
    required: true,
  }
);
</script>

<template>
  <div class="flex items-center h-11 rounded-[10px] border border-[var(--control)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
    <span class="text-sm font-semibold text-[var(--muted)] mr-2 shrink-0">Rp</span>
    <input
      :id="id"
      v-model.number="model"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :readonly="readonly"
      :required="required"
      class="w-full bg-transparent border-0 outline-none text-base font-semibold num"
    />
  </div>
</template>

