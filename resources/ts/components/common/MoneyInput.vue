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
  <div class="flex items-center min-h-[48px] rounded-[12px] border border-[var(--control)] bg-[var(--surface)] px-3.5 focus-within:border-[var(--primary)]">
    <span class="text-sm font-bold text-[var(--muted)] mr-2 shrink-0">Rp</span>
    <input
      :id="id"
      v-model.number="model"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :readonly="readonly"
      :required="required"
      class="w-full bg-transparent border-0 outline-none text-[18px] font-bold num text-[var(--text)]"
    />
  </div>
</template>
