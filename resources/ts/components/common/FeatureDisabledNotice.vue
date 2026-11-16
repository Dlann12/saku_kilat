<script setup lang="ts">
defineProps<{
  enabled: boolean;
  featureName: string;
}>();
</script>

<template>
  <div
    v-if="!enabled"
    class="mb-5 p-4 rounded-[14px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] text-sm"
  >
    <strong>Fitur Dinonaktifkan Sementara:</strong> Layanan <strong>{{ featureName }}</strong> saat ini dinonaktifkan oleh Administrator melalui pengaturan aplikasi.
  </div>
</template>

