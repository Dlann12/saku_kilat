import { shallowRef } from 'vue';
import { formatRupiah } from '@/utils/format';

export function useBalancePrivacy() {
  const hidden = shallowRef(false);

  function toggle(): void {
    hidden.value = !hidden.value;
  }

  function maskAmount(amount: number | string | null | undefined): string {
    return hidden.value ? 'Rp ••••••' : formatRupiah(amount);
  }

  return {
    hidden,
    toggle,
    maskAmount,
  };
}

