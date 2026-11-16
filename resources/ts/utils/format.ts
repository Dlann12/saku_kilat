import jsQR from 'jsqr';

export function formatRupiah(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  const abs = Math.abs(Math.round(num * 100) / 100);
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);
  return `${num < 0 ? '-' : ''}Rp\u00A0${formatted}`;
}

export function signedRupiah(amount: number | string, direction?: string): string {
  const formatted = formatRupiah(Math.abs(Number(amount ?? 0)));
  if (direction === 'IN') return `+${formatted}`;
  if (direction === 'OUT') return `-${formatted}`;
  return formatted;
}

export function formatDateTimeWib(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export function pocketColors(categoryKey?: string | null): { bg: string; ink: string; label: string } {
  switch ((categoryKey ?? '').toLowerCase()) {
    case 'food':
      return { bg: 'var(--pocket-food-bg)', ink: 'var(--pocket-food-ink)', label: 'Konsumsi' };
    case 'transport':
      return { bg: 'var(--pocket-transport-bg)', ink: 'var(--pocket-transport-ink)', label: 'Transportasi' };
    case 'savings':
      return { bg: 'var(--pocket-savings-bg)', ink: 'var(--pocket-savings-ink)', label: 'Tabungan' };
    case 'bills':
      return { bg: 'var(--pocket-bills-bg)', ink: 'var(--pocket-bills-ink)', label: 'Tagihan' };
    default:
      return { bg: 'var(--accent-soft)', ink: 'var(--accent-ink)', label: 'Utama' };
  }
}

export function decodeQrFromImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context unavailable'));
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        resolve(code.data);
      } else {
        reject(new Error('Gambar tidak mengandung kode QRIS yang dapat dibaca.'));
      }
    };
      img.onerror = () => reject(new Error('Gagal memuat berkas gambar.'));
    img.src = URL.createObjectURL(file);
  });
}

export function getInitials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'SK';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}


