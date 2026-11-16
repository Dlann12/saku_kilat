<script setup lang="ts">
import QRCode from 'qrcode';
import { shallowRef, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    value: string;
    size?: number;
    alt?: string;
  }>(),
  { size: 160, alt: 'Kode QR SakuKilat' }
);

const dataUrl = shallowRef('');

watch(
  () => [props.value, props.size] as const,
  async ([val, sz]) => {
    if (!val) {
      dataUrl.value = '';
      return;
    }
    dataUrl.value = await QRCode.toDataURL(val, {
      width: sz,
      margin: 1,
      color: { dark: '#1B1D1F', light: '#FFFFFF' },
    });
  },
  { immediate: true }
);
</script>

<template>
  <img
    v-if="dataUrl"
    :src="dataUrl"
    :width="size"
    :height="size"
    :alt="alt"
    class="block rounded-[8px]"
  />
</template>

