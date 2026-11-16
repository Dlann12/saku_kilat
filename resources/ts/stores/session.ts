import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type {
  DemoPersona,
  TransactionRecord,
  UserNotification,
  UserProfile,
  WalletSummary,
} from '@/types/sakukilat';
import { apiFetch } from '@/utils/api';

interface SessionResponse {
  authenticated: boolean;
  user: UserProfile | null;
  balance_limit: number | null;
  demo_personas: DemoPersona[];
  notifications: UserNotification[];
  unread_count: number;
  csrf_token: string;
}

export interface PinPromptConfig {
  title: string;
  amount: number | null;
  onAuthorized: (txAuthToken: string) => Promise<void>;
}

export const useSessionStore = defineStore('session', () => {
  const initialized = shallowRef(false);
  const user = ref<UserProfile | null>(null);
  const demoPersonas = ref<DemoPersona[]>([]);
  const notifications = ref<UserNotification[]>([]);
  const unreadCount = shallowRef(0);
  const walletSummary = ref<WalletSummary | null>(null);

  const notifOpen = shallowRef(false);
  const mobileDrawerOpen = shallowRef(false);
  const activeReceipt = ref<TransactionRecord | null>(null);
  const activePinPrompt = ref<PinPromptConfig | null>(null);
  const flashMessage = shallowRef('');

  async function fetchSession(): Promise<SessionResponse> {
    const res = await apiFetch<SessionResponse>('/api/v1/auth/session');
    user.value = res.user;
    demoPersonas.value = res.demo_personas;
    notifications.value = res.notifications;
    unreadCount.value = res.unread_count;
    initialized.value = true;
    return res;
  }

  async function fetchWallets(): Promise<WalletSummary | null> {
    if (!user.value) {
      walletSummary.value = null;
      return null;
    }
    const data = await apiFetch<WalletSummary>('/api/v1/wallets');
    walletSummary.value = data;
    return data;
  }

  async function switchDemoPersona(userId: string): Promise<void> {
    const data = await apiFetch<{ user: UserProfile }>('/api/v1/auth/demo-switch', {
      method: 'POST',
      body: { user_id: userId },
    });
    flashMessage.value = `Berhasil beralih ke akun ${data.user.full_name}.`;
    await fetchSession();
    await fetchWallets();
    setTimeout(() => {
      flashMessage.value = '';
    }, 3500);
  }

  async function logout(): Promise<void> {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    user.value = null;
    walletSummary.value = null;
    notifications.value = [];
    unreadCount.value = 0;
  }

  async function markNotificationsRead(): Promise<void> {
    await apiFetch('/api/v1/notifications/read', { method: 'POST' });
    await fetchSession();
  }

  function openReceipt(tx: TransactionRecord): void {
    activeReceipt.value = tx;
  }

  function closeReceipt(): void {
    activeReceipt.value = null;
  }

  function requestPin(config: PinPromptConfig): void {
    activePinPrompt.value = config;
  }

  function closePin(): void {
    activePinPrompt.value = null;
  }

  return {
    initialized,
    user,
    demoPersonas,
    notifications,
    unreadCount,
    walletSummary,
    notifOpen,
    mobileDrawerOpen,
    activeReceipt,
    activePinPrompt,
    flashMessage,
    fetchSession,
    fetchWallets,
    switchDemoPersona,
    logout,
    markNotificationsRead,
    openReceipt,
    closeReceipt,
    requestPin,
    closePin,
  };
});

