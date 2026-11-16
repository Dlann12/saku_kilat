<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { useSessionStore } from '@/stores/session';
import { apiFetch } from '@/utils/api';
import { formatRupiah, getInitials } from '@/utils/format';

const store = useSessionStore();
const pinValue = shallowRef('');
const errorMsg = shallowRef('');
const busy = shallowRef(false);
const inputRef = useTemplateRef<HTMLInputElement>('pinInput');

const summaryInitials = computed(() =>
  getInitials(store.activePinPrompt?.recipientName || store.activePinPrompt?.title)
);

watch(
  () => store.activePinPrompt,
  async (prompt) => {
    pinValue.value = '';
    errorMsg.value = '';
    busy.value = false;
    if (prompt) {
      await nextTick();
      inputRef.value?.focus();
    }
  }
);

function handleEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape' && store.activePinPrompt && !busy.value) {
    store.closePin();
  }
}

onMounted(() => window.addEventListener('keydown', handleEscape));
onBeforeUnmount(() => window.removeEventListener('keydown', handleEscape));

async function submitPin(pin: string): Promise<void> {
  if (pin.length !== 6 || !store.activePinPrompt || busy.value) return;
  busy.value = true;
  errorMsg.value = '';
  try {
    const res = await apiFetch<{ tx_auth_token: string }>('/api/v1/auth/pin/verify', {
      method: 'POST',
      body: { pin },
    });
    const cb = store.activePinPrompt.onAuthorized;
    store.closePin();
    await cb(res.tx_auth_token);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'PIN tidak valid.';
    pinValue.value = '';
  } finally {
    busy.value = false;
  }
}

function appendDigit(digit: string): void {
  if (pinValue.value.length >= 6 || busy.value) return;
  pinValue.value += digit;
  if (pinValue.value.length === 6) {
    void submitPin(pinValue.value);
  }
}

function handleKeyboard(e: Event): void {
  const val = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
  pinValue.value = val;
  if (val.length === 6) {
    void submitPin(val);
  }
}

function removeDigit(): void {
  pinValue.value = pinValue.value.slice(0, -1);
}

async function authorizeBiometric(): Promise<void> {
  if (!store.activePinPrompt || busy.value) return;
  busy.value = true;
  errorMsg.value = '';
  try {
    const res = await apiFetch<{ tx_auth_token: string }>('/api/v1/auth/biometric', {
      method: 'POST',
      body: { action: 'authorize' },
    });
    const cb = store.activePinPrompt.onAuthorized;
    store.closePin();
    await cb(res.tx_auth_token);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Otorisasi biometrik gagal.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="store.activePinPrompt"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sk-pin-title"
      @click.self="!busy && store.closePin()"
    >
      <div
        class="w-full sm:max-w-[420px] bg-[var(--ground)] border border-[var(--border)] rounded-t-[24px] sm:rounded-[24px] p-5 max-h-[94dvh] overflow-y-auto"
        style="box-shadow: 0 18px 44px rgba(19, 27, 46, 0.22)"
      >
        <!-- Stack Top Header -->
        <div class="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--primary)] flex items-center justify-center shrink-0">
              <AppIcon name="lock" size-class="w-4 h-4" />
            </span>
            <h2 id="sk-pin-title" class="text-[16px] font-bold truncate">
              {{ store.activePinPrompt.title }}
            </h2>
          </div>
          <button
            type="button"
            class="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[var(--variant)] hover:bg-[var(--container)]"
            aria-label="Tutup modal PIN"
            @click="store.closePin()"
          >
            <AppIcon name="close" />
          </button>
        </div>

        <!-- Ringkasan Transaksi (sesuai mockup 07 Konfirmasi & PIN Keamanan) -->
        <div
          v-if="store.activePinPrompt.amount !== null || store.activePinPrompt.recipientName"
          class="mt-3 p-4 rounded-[18px] bg-[var(--surface)] border border-[var(--border)] space-y-3"
        >
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-full bg-[var(--container)] text-[var(--primary)] font-bold text-sm flex items-center justify-center shrink-0">
              {{ summaryInitials }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-[14px] font-bold truncate">
                {{ store.activePinPrompt.recipientName || store.activePinPrompt.title }}
              </p>
              <p v-if="store.activePinPrompt.recipientSub" class="text-xs text-[var(--muted)] truncate">
                {{ store.activePinPrompt.recipientSub }}
              </p>
            </div>
            <span class="sk-pill sk-pill-pos">
              <AppIcon name="verified" size-class="w-3.5 h-3.5" />
              Siap Eksekusi
            </span>
          </div>

          <div
            v-if="store.activePinPrompt.amount !== null"
            class="pt-3 border-t border-[var(--rule)] flex items-baseline justify-between gap-2"
          >
            <span class="text-xs font-medium text-[var(--muted)]">Nominal</span>
            <span class="text-[20px] font-bold num text-[var(--text)]">
              {{ formatRupiah(store.activePinPrompt.amount) }}
            </span>
          </div>

          <div class="flex items-center justify-between text-xs">
            <span class="text-[var(--muted)]">Biaya Admin</span>
            <span class="font-semibold text-[var(--primary)] num">
              {{
                (store.activePinPrompt.adminFee ?? 0) === 0
                  ? 'Gratis (Rp 0)'
                  : formatRupiah(store.activePinPrompt.adminFee)
              }}
            </span>
          </div>

          <div class="flex items-center justify-between text-xs">
            <span class="text-[var(--muted)]">Sumber Dana</span>
            <span class="font-semibold text-[var(--text)]">
              {{ store.activePinPrompt.sourceWalletName || 'Saldo Saku Utama' }}
            </span>
          </div>
        </div>

        <!-- PIN Instruction & 6 Dots -->
        <div class="mt-4 text-center">
          <p class="text-[15px] font-bold">Masukkan 6 Digit PIN Saku</p>
          <p class="mt-0.5 text-xs text-[var(--muted)]">
            Demo PIN aktif: <span class="font-mono-id font-semibold">123456</span>
          </p>
        </div>

        <input
          id="pin-keyboard-input"
          ref="pinInput"
          :value="pinValue"
          type="password"
          inputmode="numeric"
          maxlength="6"
          class="sr-only"
          aria-label="Ketik PIN 6 digit"
          @input="handleKeyboard"
        />

        <div class="mt-4 flex justify-center gap-3 cursor-text" @click="inputRef?.focus()">
          <span
            v-for="i in 6"
            :key="i"
            class="w-4 h-4 rounded-full border-2 transition-colors"
            :style="{
              borderColor: i <= pinValue.length ? 'var(--primary)' : 'var(--control)',
              background: i <= pinValue.length ? 'var(--primary)' : 'var(--surface)',
            }"
          />
        </div>

        <p class="mt-2.5 min-h-[18px] text-xs font-medium text-center text-[var(--negative)]">
          {{ errorMsg }}
        </p>

        <!-- 3x4 PIN Keypad -->
        <div class="mt-2 grid grid-cols-3 gap-2.5">
          <button
            v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
            :key="d"
            type="button"
            :data-pin-digit="d"
            class="min-h-[50px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--container-low)] active:scale-95 text-[18px] font-bold num transition-transform"
            @click="appendDigit(d)"
          >
            {{ d }}
          </button>

          <button
            v-if="store.user?.biometric_enabled"
            type="button"
            class="min-h-[50px] rounded-[14px] border border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent-ink)] text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-90"
            @click="authorizeBiometric"
          >
            <AppIcon name="fingerprint" size-class="w-4 h-4" />
            <span>Biometrik</span>
          </button>
          <div v-else class="min-h-[50px]" />

          <button
            type="button"
            data-pin-digit="0"
            class="min-h-[50px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--container-low)] active:scale-95 text-[18px] font-bold num transition-transform"
            @click="appendDigit('0')"
          >
            0
          </button>

          <button
            type="button"
            class="min-h-[50px] rounded-[14px] border border-[var(--border)] bg-[var(--container-low)] hover:bg-[var(--container)] text-sm font-semibold text-[var(--variant)] flex items-center justify-center gap-1"
            aria-label="Hapus digit PIN"
            @click="removeDigit"
          >
            <AppIcon name="backspace" size-class="w-[18px] h-[18px]" />
            <span>Hapus</span>
          </button>
        </div>

        <p v-if="busy" class="mt-3 text-xs text-center font-medium text-[var(--primary)]">
          Memverifikasi PIN &amp; mengeksekusi transaksi...
        </p>
        <p v-else class="mt-3 text-[11px] text-center text-[var(--muted)]">
          Token otorisasi PIN berlaku 60 detik di server SakuKilat.
        </p>
      </div>
    </div>
  </Teleport>
</template>
