import crypto from "node:crypto";

const DEFAULT_JWT_SECRET = "sakukilat-local-jwt-secret-key-2026-sakukilat-v2";
const DEFAULT_NIK_KEY =
  "4b7e9f2c1a8d6e3f5b0c9d4e2a1f8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a";
const DEFAULT_WEBHOOK_SECRET = "sakukilat-va-webhook-hmac-secret-dev-2026";

function getNikKeyBuffer(): Buffer {
  const hex = (process.env.NIK_ENCRYPTION_KEY || DEFAULT_NIK_KEY).trim();
  const buf = Buffer.from(hex, "hex");
  if (buf.length === 32) return buf;
  return crypto.createHash("sha256").update(hex).digest();
}

export function getJwtSecret(): string {
  return process.env.AUTH_JWT_SECRET || DEFAULT_JWT_SECRET;
}

export function getWebhookSecret(): string {
  return process.env.WEBHOOK_HMAC_SECRET || DEFAULT_WEBHOOK_SECRET;
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pin, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, salt, hexDigest] = parts;
  const derived = crypto.scryptSync(pin, salt, 64);
  const expected = Buffer.from(hexDigest, "hex");
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

export function encryptNik(nik: string): string {
  const iv = crypto.randomBytes(12);
  const key = getNikKeyBuffer();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(nik, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptNik(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted NIK format");
  }
  const [, ivHex, tagHex, cipherHex] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getNikKeyBuffer(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function hashNik(nik: string): string {
  return crypto.createHash("sha256").update(nik.trim()).digest("hex");
}

export function hashPayload(value: unknown): string {
  const canonical = JSON.stringify(sortKeysDeep(value));
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

export function signHmacSha256(
  rawBody: string,
  timestampSeconds: string,
  secret = getWebhookSecret()
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
}

export function verifyHmacSha256(
  rawBody: string,
  timestampSeconds: string,
  providedSignature: string,
  maxSkewSeconds = 30,
  secret = getWebhookSecret(),
  nowSeconds = Math.floor(Date.now() / 1000)
): { valid: boolean; reason?: string } {
  const ts = Number(timestampSeconds);
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: "INVALID_TIMESTAMP" };
  }
  if (Math.abs(nowSeconds - ts) > maxSkewSeconds) {
    return { valid: false, reason: "REPLAY_WINDOW_EXCEEDED" };
  }
  const expected = signHmacSha256(rawBody, timestampSeconds, secret);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(providedSignature.trim(), "hex");
  if (a.length !== b.length || a.length === 0) {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }
  if (!crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }
  return { valid: true };
}

export function normalizePhoneNumber(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+62")) return cleaned;
  if (cleaned.startsWith("62")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+62${cleaned.slice(1)}`;
  if (cleaned.startsWith("8")) return `+62${cleaned}`;
  return cleaned;
}

export function maskRecipientName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return "***";
  if (parts.length === 1) {
    const word = parts[0];
    if (word.length <= 2) return `${word[0]}***`;
    return `${word.slice(0, 2)}${"*".repeat(Math.min(5, word.length - 2))}`;
  }
  const first = parts[0];
  const second = parts[1];
  const visible = second.slice(0, Math.min(2, second.length));
  return `${first} ${visible}*****`;
}

export function generateNumericOtp(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += crypto.randomInt(0, 10).toString();
  }
  return out;
}

export function generateReferenceNumber(prefix = "SK"): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

