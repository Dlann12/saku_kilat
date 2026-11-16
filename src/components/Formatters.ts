export function formatRupiah(amount: number, withDecimals = false): string {
  const abs = Math.abs(Math.round(amount * 100) / 100);
  const formatted = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(abs);
  return `${amount < 0 ? "-" : ""}Rp\u00A0${formatted}`;
}

export function formatSignedRupiah(amount: number, direction: "IN" | "OUT" | "INTERNAL"): string {
  const absFormatted = formatRupiah(Math.abs(amount));
  if (direction === "IN") return `+${absFormatted}`;
  if (direction === "OUT") return `-${absFormatted}`;
  return absFormatted;
}

export function formatDateTimeWib(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
}

export function getPocketColors(categoryKey: string): {
  bg: string;
  ink: string;
  label: string;
} {
  switch (categoryKey) {
    case "food":
      return { bg: "var(--pocket-food-bg)", ink: "var(--pocket-food-ink)", label: "Konsumsi" };
    case "transport":
      return {
        bg: "var(--pocket-transport-bg)",
        ink: "var(--pocket-transport-ink)",
        label: "Transportasi",
      };
    case "savings":
      return {
        bg: "var(--pocket-savings-bg)",
        ink: "var(--pocket-savings-ink)",
        label: "Tabungan",
      };
    case "bills":
      return { bg: "var(--pocket-bills-bg)", ink: "var(--pocket-bills-ink)", label: "Tagihan" };
    default:
      return { bg: "var(--accent-soft)", ink: "var(--accent-ink)", label: "Utama" };
  }
}

export function makeIdempotencyKey(prefix = "sk"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

