import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '@/stores/session';

const HomeView = () => import('@/pages/HomeView.vue');
const UserLoginView = () => import('@/pages/UserLoginView.vue');
const AdminLoginView = () => import('@/pages/AdminLoginView.vue');
const TopupView = () => import('@/pages/TopupView.vue');
const PocketsView = () => import('@/pages/PocketsView.vue');
const QrisView = () => import('@/pages/QrisView.vue');
const TransferView = () => import('@/pages/TransferView.vue');
const PpobView = () => import('@/pages/PpobView.vue');
const SplitBillView = () => import('@/pages/SplitBillView.vue');
const RiwayatView = () => import('@/pages/RiwayatView.vue');
const ProfilView = () => import('@/pages/ProfilView.vue');
const MerchantView = () => import('@/pages/MerchantView.vue');
const AdminView = () => import('@/pages/AdminView.vue');

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Beranda' } },
    { path: '/login', name: 'login', component: UserLoginView, meta: { title: 'Login Pengguna', standalone: true } },
    { path: '/auth', redirect: '/login' },
    { path: '/admin/login', name: 'admin-login', component: AdminLoginView, meta: { title: 'Login Admin Kepatuhan', standalone: true } },
    { path: '/topup', name: 'topup', component: TopupView, meta: { title: 'Top Up Saldo' } },
    { path: '/pockets', name: 'pockets', component: PocketsView, meta: { title: 'Kantong Pintar' } },
    { path: '/qris', name: 'qris', component: QrisView, meta: { title: 'Scan & Bayar QRIS' } },
    { path: '/transfer', name: 'transfer', component: TransferView, meta: { title: 'Transfer Dana' } },
    { path: '/ppob', name: 'ppob', component: PpobView, meta: { title: 'Bayar & Beli PPOB' } },
    { path: '/split-bill', name: 'split-bill', component: SplitBillView, meta: { title: 'Patungan (Split Bill)' } },
    { path: '/riwayat', name: 'riwayat', component: RiwayatView, meta: { title: 'Riwayat & Laporan' } },
    { path: '/profil', name: 'profil', component: ProfilView, meta: { title: 'Profil & KYC' } },
    { path: '/merchant', name: 'merchant', component: MerchantView, meta: { title: 'SakuKilat Bisnis' } },
    { path: '/admin', name: 'admin', component: AdminView, meta: { title: 'Admin & Ledger' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const store = useSessionStore();
  if (!store.initialized) {
    await store.fetchSession();
  }

  document.title = to.meta.title ? `${to.meta.title} — SakuKilat` : 'SakuKilat';

  if (to.name !== 'login' && to.name !== 'admin-login' && !store.user) {
    return to.name === 'admin' ? { name: 'admin-login' } : { name: 'login' };
  }
  return true;
});

