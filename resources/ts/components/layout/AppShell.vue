<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';
import PinAuthModal from '@/components/layout/PinAuthModal.vue';
import ReceiptModal from '@/components/layout/ReceiptModal.vue';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const store = useSessionStore();

const navPrimary = [
  { to: '/', name: 'home', label: 'Beranda', icon: 'home' },
  { to: '/riwayat', name: 'riwayat', label: 'Riwayat', icon: 'history' },
  { to: '/qris', name: 'qris', label: 'Scan & Bayar QRIS', icon: 'qris' },
  { to: '/pockets', name: 'pockets', label: 'Kantong Pintar', icon: 'wallet' },
  { to: '/transfer', name: 'transfer', label: 'Transfer Dana', icon: 'transfer' },
  { to: '/ppob', name: 'ppob', label: 'Bayar & Beli PPOB', icon: 'zap' },
];

const navSecondary = [
  { to: '/split-bill', name: 'split-bill', label: 'Patungan (Split Bill)', icon: 'users' },
  { to: '/merchant', name: 'merchant', label: 'SakuKilat Bisnis', icon: 'store' },
  { to: '/admin', name: 'admin', label: 'Admin & Ledger', icon: 'shield' },
];

const drawerLinks = [
  ...navPrimary,
  ...navSecondary,
  { to: '/topup', name: 'topup', label: 'Top Up Saldo', icon: 'plus' },
  { to: '/profil', name: 'profil', label: 'Profil & KYC', icon: 'user' },
  { to: '/login', name: 'login', label: 'Login / Ganti Akun', icon: 'login' },
];

const pageTitle = computed(() => (route.meta.title as string) || 'SakuKilat');

async function onPersonaChange(e: Event): Promise<void> {
  const userId = (e.target as HTMLSelectElement).value;
  if (!userId) return;
  await store.switchDemoPersona(userId);
  store.mobileDrawerOpen = false;
}
</script>

<template>
  <div class="sk-shell">
    <!-- Desktop Open-Plane Sidebar -->
    <aside class="sk-sidebar" aria-label="Navigasi utama">
      <div class="flex items-center gap-2.5 px-2 pb-4">
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="#1D5FD6" />
          <path
            d="M17.5 6.5L10 17.5H16L14.5 25.5L22 14.5H16L17.5 6.5Z"
            fill="#FFFFFF"
            stroke="#FFFFFF"
            stroke-width="1"
            stroke-linejoin="round"
          />
        </svg>
        <div>
          <p class="text-[15px] font-semibold tracking-tight leading-tight">SakuKilat</p>
          <p class="text-[11px] text-[var(--faint)]">Dompet Digital</p>
        </div>
      </div>

      <div v-if="store.demoPersonas.length" class="mb-4 px-1">
        <label
          for="desktop-persona-select"
          class="block text-[11px] font-medium text-[var(--faint)] mb-1 px-1"
        >
          Akun Aktif (Demo Persona)
        </label>
        <select
          id="desktop-persona-select"
          :value="store.user?.id || ''"
          class="w-full h-9 px-2.5 text-[13px] font-medium bg-[var(--surface)] border border-[var(--border)] rounded-[9px] cursor-pointer"
          @change="onPersonaChange"
        >
          <option v-for="p in store.demoPersonas" :key="p.id" :value="p.id">
            {{ p.full_name }} ({{ p.kyc_status === 'VERIFIED' ? 'KYC' : 'Basic' }})
          </option>
        </select>
      </div>

      <nav class="space-y-0.5">
        <RouterLink
          v-for="item in navPrimary"
          :key="item.name"
          :to="item.to"
          class="flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] transition-colors"
          :class="
            route.name === item.name
              ? 'bg-[var(--active)] text-[var(--text)] font-medium'
              : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
          "
        >
          <AppIcon :name="item.icon" size-class="w-4 h-4 shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </RouterLink>

        <p class="mt-5 mb-1.5 px-2.5 text-[12px] text-[var(--faint)]">Layanan &amp; Pengawasan</p>

        <RouterLink
          v-for="item in navSecondary"
          :key="item.name"
          :to="item.to"
          class="flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] transition-colors"
          :class="
            route.name === item.name
              ? 'bg-[var(--active)] text-[var(--text)] font-medium'
              : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
          "
        >
          <AppIcon :name="item.icon" size-class="w-4 h-4 shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="mt-auto pt-4 border-t border-[var(--border)] space-y-1">
        <button
          type="button"
          class="w-full flex items-center justify-between h-9 px-2.5 rounded-[8px] text-[14px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          @click="store.notifOpen = true"
        >
          <span class="flex items-center gap-2.5">
            <AppIcon name="bell" />
            <span>Notifikasi</span>
          </span>
          <span
            v-if="store.unreadCount > 0"
            class="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--accent)] text-white text-[11px] font-medium flex items-center justify-center num"
          >
            {{ store.unreadCount }}
          </span>
        </button>

        <RouterLink
          to="/profil"
          class="flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px]"
          :class="
            route.name === 'profil'
              ? 'bg-[var(--active)] text-[var(--text)] font-medium'
              : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
          "
        >
          <AppIcon name="user" />
          <span>Profil &amp; KYC</span>
        </RouterLink>

        <RouterLink
          to="/login"
          class="flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
        >
          <AppIcon name="login" />
          <span>Login / Ganti Akun</span>
        </RouterLink>
      </div>
    </aside>

    <!-- Main Column -->
    <div class="min-w-0 flex flex-col">
      <header class="sk-mobile-header">
        <div class="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#1D5FD6" />
            <path d="M17.5 6.5L10 17.5H16L14.5 25.5L22 14.5H16L17.5 6.5Z" fill="#FFFFFF" />
          </svg>
          <span class="text-[15px] font-semibold tracking-tight">{{ pageTitle }}</span>
        </div>

        <div class="flex items-center gap-1">
          <button
            type="button"
            aria-label="Buka Notifikasi"
            class="relative w-10 h-10 flex items-center justify-center rounded-[10px] hover:bg-[var(--raised)]"
            @click="store.notifOpen = true"
          >
            <AppIcon name="bell" size-class="w-[18px] h-[18px]" />
            <span
              v-if="store.unreadCount > 0"
              class="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--accent)]"
            />
          </button>
          <button
            type="button"
            aria-label="Buka Menu"
            class="w-10 h-10 flex items-center justify-center rounded-[10px] hover:bg-[var(--raised)]"
            @click="store.mobileDrawerOpen = true"
          >
            <AppIcon name="menu" size-class="w-5 h-5" />
          </button>
        </div>
      </header>

      <main class="sk-canvas flex-1">
        <div class="sk-container">
          <div
            v-if="store.flashMessage"
            class="mb-4 p-3 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm"
          >
            {{ store.flashMessage }}
          </div>
          <slot />
        </div>
      </main>
    </div>

    <!-- One-Thumb Reachability Bottom Nav (Mobile <= 860px) -->
    <nav class="sk-bottom-nav" aria-label="Navigasi bawah mobile">
      <RouterLink
        to="/"
        class="flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium"
        :class="route.name === 'home' ? 'text-[var(--accent)]' : 'text-[var(--muted)]'"
      >
        <AppIcon name="home" size-class="w-5 h-5" />
        <span>Beranda</span>
      </RouterLink>
      <RouterLink
        to="/riwayat"
        class="flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium"
        :class="route.name === 'riwayat' ? 'text-[var(--accent)]' : 'text-[var(--muted)]'"
      >
        <AppIcon name="history" size-class="w-5 h-5" />
        <span>Riwayat</span>
      </RouterLink>
      <RouterLink to="/qris" class="flex flex-col items-center justify-end pb-0.5" aria-label="Scan & Bayar QRIS">
        <span class="w-12 h-12 -mt-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center border-4 border-[var(--surface)]">
          <AppIcon name="qris" size-class="w-5 h-5" />
        </span>
        <span class="text-[11px] font-semibold text-[var(--accent)] mt-0.5">QRIS</span>
      </RouterLink>
      <RouterLink
        to="/pockets"
        class="flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium"
        :class="route.name === 'pockets' ? 'text-[var(--accent)]' : 'text-[var(--muted)]'"
      >
        <AppIcon name="wallet" size-class="w-5 h-5" />
        <span>Kantong</span>
      </RouterLink>
      <RouterLink
        to="/profil"
        class="flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium"
        :class="route.name === 'profil' ? 'text-[var(--accent)]' : 'text-[var(--muted)]'"
      >
        <AppIcon name="user" size-class="w-5 h-5" />
        <span>Profil</span>
      </RouterLink>
    </nav>

    <!-- Mobile Drawer -->
    <Teleport to="body">
      <div
        v-if="store.mobileDrawerOpen"
        class="fixed inset-0 z-50 bg-black/35 flex justify-end"
      >
        <div class="w-full max-w-[320px] h-full bg-[var(--surface)] p-5 overflow-y-auto">
          <div class="flex items-center justify-between pb-4 border-b border-[var(--border)]">
            <span class="font-semibold">Menu SakuKilat</span>
            <button
              type="button"
              class="w-10 h-10 rounded-[8px] flex items-center justify-center text-[var(--muted)]"
              aria-label="Tutup menu"
              @click="store.mobileDrawerOpen = false"
            >
              <AppIcon name="close" />
            </button>
          </div>
          <div v-if="store.demoPersonas.length" class="mt-4">
            <label for="mobile-persona-select" class="block text-xs font-medium text-[var(--muted)] mb-1.5">
              Ganti Akun Demo
            </label>
            <select
              id="mobile-persona-select"
              :value="store.user?.id || ''"
              class="sk-input text-sm"
              @change="onPersonaChange"
            >
              <option v-for="p in store.demoPersonas" :key="p.id" :value="p.id">
                {{ p.full_name }} ({{ p.kyc_status }})
              </option>
            </select>
          </div>
          <div class="mt-5 space-y-1">
            <RouterLink
              v-for="item in drawerLinks"
              :key="item.name"
              :to="item.to"
              class="flex items-center gap-3 min-h-[44px] px-3 rounded-[10px] text-sm"
              :class="route.name === item.name ? 'bg-[var(--active)] font-medium text-[var(--text)]' : 'text-[var(--muted)]'"
              @click="store.mobileDrawerOpen = false"
            >
              <AppIcon :name="item.icon" />
              <span>{{ item.label }}</span>
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Notifications Modal -->
      <div
        v-if="store.notifOpen"
        class="fixed inset-0 z-50 bg-black/35 flex items-end sm:items-center justify-center p-0 sm:p-4"
      >
        <div
          class="w-full sm:max-w-[460px] max-h-[80vh] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-t-[20px] sm:rounded-[20px] p-5"
          style="box-shadow: 0 12px 32px rgba(27, 29, 31, 0.14)"
        >
          <div class="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div>
              <h2 class="text-[17px] font-semibold">Pusat Notifikasi</h2>
              <p class="text-xs text-[var(--muted)]">Alert transaksi, KYC, patungan &amp; OTP sandbox</p>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="store.unreadCount > 0"
                type="button"
                class="text-xs font-medium text-[var(--accent)] px-2 py-1 rounded-[6px] hover:bg-[var(--raised)]"
                @click="store.markNotificationsRead()"
              >
                Tandai terbaca
              </button>
              <button
                type="button"
                class="w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--muted)] hover:bg-[var(--raised)]"
                aria-label="Tutup notifikasi"
                @click="store.notifOpen = false"
              >
                <AppIcon name="close" />
              </button>
            </div>
          </div>
          <div class="mt-3 overflow-y-auto divide-y divide-[var(--rule)]">
            <div v-for="n in store.notifications" :key="n.id" class="py-3">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-medium">{{ n.title }}</p>
                <span class="sk-pill sk-pill-neutral">{{ n.channel }}</span>
              </div>
              <p class="mt-1 text-xs text-[var(--muted)] leading-relaxed">{{ n.body }}</p>
            </div>
            <p v-if="!store.notifications.length" class="py-8 text-center text-sm text-[var(--muted)]">
              Belum ada notifikasi baru.
            </p>
          </div>
        </div>
      </div>
    </Teleport>

    <PinAuthModal />
    <ReceiptModal />
  </div>
</template>
