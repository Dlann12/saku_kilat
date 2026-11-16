<script setup lang="ts">
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { useSessionStore } from '@/stores/session';
import { apiFetch } from '@/utils/api';
import { formatRupiah } from '@/utils/format';

const store = useSessionStore();
const pinValue = shallowRef('');
const errorMsg = shallowRef('');
const busy = shallowRef(false);
const inputRef = useTemplateRef<HTMLInputElement>('pinInput');

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
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sk-pin-title"
    >
      <div
        class="w-full sm:max-w-[380px] bg-[var(--surface)] border border-[var(--border)] rounded-t-[20px] sm:rounded-[20px] p-6"
        style="box-shadow: 0 12px 32px rgba(27, 29, 31, 0.14)"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 id="sk-pin-title" class="text-[17px] font-semibold">
              {{ store.activePinPrompt.title }}
            </h2>
            <p class="mt-0.5 text-xs text-[var(--muted)]">
              Masukkan 6-digit PIN keamanan (Demo: <span class="font-mono-id">123456</span>)
            </p>
          </div>
          <button
            type="button"
            class="w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--muted)] hover:bg-[var(--raised)]"
            aria-label="Tutup modal PIN"
            @click="store.closePin()"
          >
            <AppIcon name="close" />
          </button>
        </div>

        <p
          v-if="store.activePinPrompt.amount !== null"
          class="mt-4 py-2.5 px-3 rounded-[10px] bg-[var(--ground)] text-center text-lg font-semibold num"
        >
          {{ formatRupiah(store.activePinPrompt.amount) }}
        </p>

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

        <div class="mt-5 flex justify-center gap-3 cursor-text" @click="inputRef?.focus()">
          <span
            v-for="i in 6"
            :key="i"
            class="w-3.5 h-3.5 rounded-full border-2 transition-colors"
            :style="{
              borderColor: i <= pinValue.length ? 'var(--accent)' : 'var(--control)',
              background: i <= pinValue.length ? 'var(--accent)' : 'transparent',
            }"
          />
        </div>

        <p class="mt-3 min-h-[18px] text-xs text-center text-[var(--negative)]">
          {{ errorMsg }}
        </p>

        <div class="mt-3 grid grid-cols-3 gap-2">
          <button
            v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
            :key="d"
            type="button"
            :data-pin-digit="d"
            class="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] text-lg font-semibold num"
            @click="appendDigit(d)"
          >
            {{ d }}
          </button>
          <button
            v-if="store.user?.biometric_enabled"
            type="button"
            class="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent-ink)] text-xs font-medium"
            @click="authorizeBiometric"
          >
            Biometrik
          </button>
          <div v-else />
          <button
            type="button"
            data-pin-digit="0"
            class="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] text-lg font-semibold num"
            @click="appendDigit('0')"
          >
            0
          </button>
          <button
            type="button"
            class="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] text-sm text-[var(--muted)]"
            aria-label="Hapus digit PIN"
            @click="removeDigit"
          >
            Hapus
          </button>
        </div>

        <p v-if="busy" class="mt-3 text-xs text-center text-[var(--muted)]">
          Memverifikasi &amp; mengeksekusi transaksi atomik...
        </p>
      </div>
    </div>
  </Teleport>
</template>
