<script setup lang="ts">
import { useRoute } from 'vue-router';
import AppShell from '@/components/layout/AppShell.vue';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const store = useSessionStore();
</script>

<template>
  <RouterView v-if="route.meta.standalone" />
  <AppShell v-else-if="store.user">
    <RouterView />
  </AppShell>
  <div v-else class="min-h-screen flex items-center justify-center bg-[var(--ground)] text-sm text-[var(--muted)]">
    Memuat SakuKilat...
  </div>
</template>

