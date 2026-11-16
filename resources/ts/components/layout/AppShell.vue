<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';
import PinAuthModal from '@/components/layout/PinAuthModal.vue';
import ReceiptModal from '@/components/layout/ReceiptModal.vue';
import { useSessionStore } from '@/stores/session';
import { getInitials } from '@/utils/format';

const route = useRoute();
const store = useSessionStore();

const navPrimary = [
  { to: '/', name: 'home', label: 'Beranda', icon: 'home' },
  { to: '/transfer', name: 'transfer', label: 'Kirim Uang', icon: 'send' },
  { to: '/qris', name: 'qris', label: 'QRIS Bayar', icon: 'qris' },
  { to: '/riwayat', name: 'riwayat', label: 'Riwayat', icon: 'history' },
  { to: '/pockets', name: 'pockets', label: 'Kantong Nabung', icon: 'wallet' },
  { to: '/topup', name: 'topup', label: 'Top Up Saldo', icon: 'plus' },
];

const navServices = [
  { to: '/ppob', name: 'ppob', label: 'PPOB & Tagihan', icon: 'zap' },
  { to: '/split-bill', name: 'split-bill', label: 'Patungan (Split Bill)', icon: 'users' },
  { to: '/merchant', name: 'merchant', label: 'Saku Bisnis', icon: 'store' },
  { to: '/admin', name: 'admin', label: 'Admin & Konfigurasi', icon: 'shield' },
];

const drawerLinks = [
  ...navPrimary,
  ...navServices,
  { to: '/profil', name: 'profil', label: 'Profil & Pengaturan', icon: 'user' },
  { to: '/login', name: 'login', label: 'Login / Ganti Akun', icon: 'login' },
];

const pageTitle = computed(() => {
  if (route.name === 'home') return 'Saku';
  return (route.meta.title as string) || 'Saku';
});

const userInitials = computed(() => getInitials(store.user?.full_name));

async function onPersonaChange(e: Event): Promise<void> {
  const userId = (e.target as HTMLSelectElement).value;
  if (!userId) return;
  await store.switchDemoPersona(userId);
  store.mobileDrawerOpen = false;
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  if (store.notifOpen) store.notifOpen = false;
  if (store.mobileDrawerOpen) store.mobileDrawerOpen = false;
}

onMounted(() => window.addEventListener('keydown', handleEscapeKey));
onBeforeUnmount(() => window.removeEventListener('keydown', handleEscapeKey));
</script>

<template>
  <div class="sk-shell">
    <!-- Desktop Open-Plane Sidebar -->
    <aside class="sk-sidebar" aria-label="Navigasi utama">
      <RouterLink to="/" class="flex items-center gap-2.5 px-2 pb-5 no-underline text-[var(--text)]">
        <span
          class="w-9 h-9 rounded-[11px] bg-[var(--primary)] text-white flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7.5A2.5 2.5 0 0 1 6.5 5h10A2.5 2.5 0 0 1 19 7.5V9h-4.5a3 3 0 0 0 0 6H19v1.5a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 4 16.5v-9Z"
              stroke="currentColor"
              stroke-width="1.9"
            />
            <circle cx="15" cy="12" r="1.4" fill="#6CF8BB" />
          </svg>
        </span>
        <div>
          <p class="text-[17px] font-bold tracking-tight leading-tight text-[var(--primary)]">Saku</p>
          <p class="text-[11px] font-medium text-[var(--muted)]">Dompet SakuKilat</p>
        </div>
      </RouterLink>

      <div v-if="store.demoPersonas.length" class="mb-4 px-1">
        <label
          for="desktop-persona-select"
          class="block text-[11px] font-semibold text-[var(--muted)] mb-1 px-1"
        >
          Akun Aktif
        </label>
        <select
          id="desktop-persona-select"
          :value="store.user?.id || ''"
          class="w-full min-h-[40px] px-2.5 text-[13px] font-medium bg-[var(--container-low)] border border-[var(--border)] rounded-[10px] cursor-pointer text-[var(--text)]"
          @change="onPersonaChange"
        >
          <option v-for="p in store.demoPersonas" :key="p.id" :value="p.id">
            {{ p.full_name }} ({{ p.kyc_status === 'VERIFIED' ? 'Plus' : 'Basic' }})
          </option>
        </select>
      </div>

      <nav class="space-y-1">
        <RouterLink
          v-for="item in navPrimary"
          :key="item.name"
          :to="item.to"
          class="flex items-center gap-3 min-h-[42px] px-3 rounded-[10px] text-[14px] transition-colors"
          :class="
            route.name === item.name
              ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)] font-semibold'
              : 'text-[var(--variant)] hover:bg-[var(--container-low)] hover:text-[var(--text)]'
          "
        >
          <AppIcon :name="item.icon" size-class="w-[18px] h-[18px] shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </RouterLink>

        <p class="pt-4 pb-1 px-3 text-[12px] font-semibold text-[var(--muted)]">
          Layanan &amp; Administrasi
        </p>

        <RouterLink
          v-for="item in navServices"
          :key="item.name"
          :to="item.to"
          class="flex items-center gap-3 min-h-[42px] px-3 rounded-[10px] text-[14px] transition-colors"
          :class="
            route.name === item.name
              ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)] font-semibold'
              : 'text-[var(--variant)] hover:bg-[var(--container-low)] hover:text-[var(--text)]'
          "
        >
          <AppIcon :name="item.icon" size-class="w-[18px] h-[18px] shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="mt-auto pt-4 border-t border-[var(--border)] space-y-1">
        <button
          type="button"
          class="w-full flex items-center justify-between min-h-[42px] px-3 rounded-[10px] text-[14px] text-[var(--variant)] hover:bg-[var(--container-low)] hover:text-[var(--text)]"
          @click="store.notifOpen = true"
        >
          <span class="flex items-center gap-3">
            <AppIcon name="bell" size-class="w-[18px] h-[18px]" />
            <span>Notifikasi</span>
          </span>
          <span
            v-if="store.unreadCount > 0"
            class="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[var(--primary)] text-white text-[11px] font-semibold flex items-center justify-center num"
          >
            {{ store.unreadCount }}
          </span>
        </button>

        <RouterLink
          to="/profil"
          class="flex items-center gap-3 min-h-[42px] px-3 rounded-[10px] text-[14px]"
          :class="
            route.name === 'profil'
              ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)] font-semibold'
              : 'text-[var(--variant)] hover:bg-[var(--container-low)] hover:text-[var(--text)]'
          "
        >
          <AppIcon name="user" size-class="w-[18px] h-[18px]" />
          <span>Saya &amp; Pengaturan</span>
        </RouterLink>

        <RouterLink
          to="/login"
          class="flex items-center gap-3 min-h-[42px] px-3 rounded-[10px] text-[14px] text-[var(--variant)] hover:bg-[var(--container-low)] hover:text-[var(--text)]"
        >
          <AppIcon name="login" size-class="w-[18px] h-[18px]" />
          <span>Login / Ganti Akun</span>
        </RouterLink>
      </div>
    </aside>

    <!-- Main Column -->
    <div class="min-w-0 flex flex-col">
      <!-- Sticky Mobile Header (Saku Branding + Notifications + Profile + Drawer) -->
      <header class="sk-mobile-header">
        <div class="flex items-center gap-2.5 min-w-0">
          <RouterLink
            to="/"
            class="w-8 h-8 rounded-[10px] bg-[var(--primary)] text-white flex items-center justify-center shrink-0"
            aria-label="Ke Beranda Saku"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7.5A2.5 2.5 0 0 1 6.5 5h10A2.5 2.5 0 0 1 19 7.5V9h-4.5a3 3 0 0 0 0 6H19v1.5a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 4 16.5v-9Z"
                stroke="currentColor"
                stroke-width="2"
              />
              <circle cx="15" cy="12" r="1.4" fill="#6CF8BB" />
            </svg>
          </RouterLink>
          <span class="text-[18px] font-bold tracking-tight text-[var(--primary)] truncate">
            {{ pageTitle }}
          </span>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Pemberitahuan"
            class="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-[var(--variant)] hover:bg-[var(--container-low)]"
            @click="store.notifOpen = true"
          >
            <AppIcon name="bell" size-class="w-[20px] h-[20px]" />
            <span
              v-if="store.unreadCount > 0"
              class="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-[var(--negative)] ring-2 ring-[var(--surface)]"
            />
          </button>

          <RouterLink
            to="/profil"
            aria-label="Profil Saya"
            class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-[var(--container-low)]"
          >
            <span
              class="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] ring-1 ring-[var(--primary)]/25 text-xs font-bold flex items-center justify-center"
            >
              {{ userInitials }}
            </span>
          </RouterLink>

          <button
            type="button"
            aria-label="Menu Lainnya"
            class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-[var(--variant)] hover:bg-[var(--container-low)]"
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
            class="mb-4 px-4 py-3 rounded-[12px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm font-medium"
          >
            {{ store.flashMessage }}
          </div>
          <slot />
        </div>
      </main>
    </div>

    <!-- One-Thumb Mobile Bottom Nav matching Saku design: Beranda, Kirim, QRIS, Riwayat, Saya -->
    <nav class="sk-bottom-nav" aria-label="Navigasi bawah mobile">
      <RouterLink
        to="/"
        class="flex flex-col items-center justify-center min-w-[52px] min-h-[44px] gap-0.5 text-[11px]"
        :class="route.name === 'home' ? 'text-[var(--primary)] font-bold' : 'text-[var(--muted)] font-medium'"
      >
        <AppIcon name="home" size-class="w-5 h-5" />
        <span>Beranda</span>
      </RouterLink>

      <RouterLink
        to="/transfer"
        class="flex flex-col items-center justify-center min-w-[52px] min-h-[44px] gap-0.5 text-[11px]"
        :class="route.name === 'transfer' ? 'text-[var(--primary)] font-bold' : 'text-[var(--muted)] font-medium'"
      >
        <AppIcon name="send" size-class="w-5 h-5" />
        <span>Kirim</span>
      </RouterLink>

      <RouterLink
        to="/qris"
        class="flex flex-col items-center justify-end pb-0.5"
        aria-label="Scan dan Bayar QRIS"
      >
        <span
          class="w-13 h-13 -mt-6 rounded-full bg-[var(--primary)] text-white flex items-center justify-center border-4 border-[var(--ground)]"
          style="box-shadow: 0 8px 20px -4px rgba(0, 105, 72, 0.36)"
        >
          <AppIcon name="qris" size-class="w-6 h-6" />
        </span>
        <span
          class="text-[11px] mt-0.5"
          :class="route.name === 'qris' ? 'text-[var(--primary)] font-bold' : 'text-[var(--variant)] font-semibold'"
        >
          QRIS
        </span>
      </RouterLink>

      <RouterLink
        to="/riwayat"
        class="flex flex-col items-center justify-center min-w-[52px] min-h-[44px] gap-0.5 text-[11px]"
        :class="route.name === 'riwayat' ? 'text-[var(--primary)] font-bold' : 'text-[var(--muted)] font-medium'"
      >
        <AppIcon name="history" size-class="w-5 h-5" />
        <span>Riwayat</span>
      </RouterLink>

      <RouterLink
        to="/profil"
        class="flex flex-col items-center justify-center min-w-[52px] min-h-[44px] gap-0.5 text-[11px]"
        :class="route.name === 'profil' ? 'text-[var(--primary)] font-bold' : 'text-[var(--muted)] font-medium'"
      >
        <AppIcon name="user" size-class="w-5 h-5" />
        <span>Saya</span>
      </RouterLink>
    </nav>

    <!-- Mobile Drawer & Notifications Dialog -->
    <Teleport to="body">
      <div
        v-if="store.mobileDrawerOpen"
        class="fixed inset-0 z-50 bg-black/35 flex justify-end"
        role="dialog"
        aria-modal="true"
        aria-label="Menu lengkap Saku"
        @click.self="store.mobileDrawerOpen = false"
      >
        <div class="w-full max-w-[320px] h-full bg-[var(--surface)] p-5 overflow-y-auto">
          <div class="flex items-center justify-between pb-4 border-b border-[var(--border)]">
            <span class="font-bold text-[16px] text-[var(--primary)]">Semua Menu Saku</span>
            <button
              type="button"
              class="min-w-[44px] min-h-[44px] rounded-[10px] flex items-center justify-center text-[var(--variant)] hover:bg-[var(--container-low)]"
              aria-label="Tutup menu"
              @click="store.mobileDrawerOpen = false"
            >
              <AppIcon name="close" />
            </button>
          </div>
          <div v-if="store.demoPersonas.length" class="mt-4">
            <label for="mobile-persona-select" class="block text-xs font-semibold text-[var(--muted)] mb-1.5">
              Ganti Akun Aktif
            </label>
            <select
              id="mobile-persona-select"
              :value="store.user?.id || ''"
              class="sk-input text-sm"
              @change="onPersonaChange"
            >
              <option v-for="p in store.demoPersonas" :key="p.id" :value="p.id">
                {{ p.full_name }} ({{ p.kyc_status === 'VERIFIED' ? 'Plus' : 'Basic' }})
              </option>
            </select>
          </div>
          <div class="mt-5 space-y-1">
            <RouterLink
              v-for="item in drawerLinks"
              :key="item.name"
              :to="item.to"
              class="flex items-center gap-3 min-h-[44px] px-3 rounded-[10px] text-sm"
              :class="
                route.name === item.name
                  ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]'
                  : 'text-[var(--variant)] hover:bg-[var(--container-low)]'
              "
              @click="store.mobileDrawerOpen = false"
            >
              <AppIcon :name="item.icon" size-class="w-[18px] h-[18px]" />
              <span>{{ item.label }}</span>
            </RouterLink>
          </div>
        </div>
      </div>

      <div
        v-if="store.notifOpen"
        class="fixed inset-0 z-50 bg-black/35 flex items-end sm:items-center justify-center p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Pusat Notifikasi"
        @click.self="store.notifOpen = false"
      >
        <div
          class="w-full sm:max-w-[460px] max-h-[82vh] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-t-[20px] sm:rounded-[20px] p-5"
          style="box-shadow: 0 14px 36px rgba(19, 27, 46, 0.16)"
        >
          <div class="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div>
              <h2 class="text-[17px] font-bold">Pusat Notifikasi</h2>
              <p class="text-xs text-[var(--muted)]">Riwayat alert transaksi, KYC &amp; patungan</p>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="store.unreadCount > 0"
                type="button"
                class="min-h-[38px] text-xs font-semibold text-[var(--primary)] px-2.5 py-1 rounded-[8px] hover:bg-[var(--container-low)]"
                @click="store.markNotificationsRead()"
              >
                Tandai terbaca
              </button>
              <button
                type="button"
                class="min-w-[44px] min-h-[44px] rounded-[10px] flex items-center justify-center text-[var(--variant)] hover:bg-[var(--container-low)]"
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
                <p class="text-sm font-semibold">{{ n.title }}</p>
                <span class="sk-pill sk-pill-neutral">{{ n.channel }}</span>
              </div>
              <p class="mt-1 text-xs text-[var(--muted)] leading-relaxed">{{ n.body }}</p>
            </div>
            <p v-if="!store.notifications.length" class="py-8 text-center text-sm text-[var(--muted)]">
              Belum ada notifikasi baru di akun ini.
            </p>
          </div>
        </div>
      </div>
    </Teleport>

    <PinAuthModal />
    <ReceiptModal />
  </div>
</template>
