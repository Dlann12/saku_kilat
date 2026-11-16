import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getJwtSecret } from "@/lib/crypto";
import { kvStore } from "@/lib/redis";
import { getPool } from "@/db/pool";
import { DomainError } from "@/lib/ledger";

export const SESSION_COOKIE_NAME = "sakukilat_session";
export const TX_AUTH_TTL_SECONDS = 60;

export interface SessionPayload {
  sub: string;
  phone: string;
  role: string;
  deviceId: string;
  exp: number;
  iat: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64").toString("utf8");
}

export function signSessionJwt(
  payload: Omit<SessionPayload, "iat" | "exp">,
  ttlSeconds = 60 * 60 * 24 * 7
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(full));
  const sig = crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64UrlEncode(sig)}`;
}

export function verifySessionJwt(token: string): SessionPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = base64UrlEncode(
      crypto
        .createHmac("sha256", getJwtSecret())
        .update(`${header}.${body}`)
        .digest()
    );
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (!decoded.sub || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export async function issueTxAuthToken(userId: string): Promise<{
  txAuthToken: string;
  expiresInSeconds: number;
}> {
  const token = `txa_${crypto.randomBytes(24).toString("hex")}`;
  await kvStore.set(`tx_auth:${token}`, userId, TX_AUTH_TTL_SECONDS);
  return {
    txAuthToken: token,
    expiresInSeconds: TX_AUTH_TTL_SECONDS,
  };
}

export async function consumeTxAuthToken(
  token: string,
  userId: string
): Promise<boolean> {
  if (!token || !token.startsWith("txa_")) return false;
  const key = `tx_auth:${token}`;
  const storedUserId = await kvStore.get(key);
  if (!storedUserId || storedUserId !== userId) {
    return false;
  }
  await kvStore.del(key);
  return true;
}

export async function requireAuth(request?: NextRequest): Promise<{
  userId: string;
  phoneNumber: string;
  fullName: string;
  kycStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  role: string;
  biometricEnabled: boolean;
  activeDeviceId: string | null;
}> {
  let token: string | undefined;

  if (request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else {
      token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    }
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  }

  if (!token) {
    throw new DomainError("UNAUTHORIZED", "Sesi login tidak ditemukan. Silakan masuk.", 401);
  }

  const session = verifySessionJwt(token);
  if (!session) {
    throw new DomainError("UNAUTHORIZED", "Token sesi tidak valid atau kedaluwarsa.", 401);
  }

  const res = await getPool().query<{
    id: string;
    phone_number: string;
    full_name: string;
    kyc_status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
    role: string;
    biometric_enabled: boolean;
    active_device_id: string | null;
    account_status: string;
  }>(
    `SELECT id, phone_number, full_name, kyc_status, role, biometric_enabled, active_device_id, account_status
     FROM users WHERE id = $1`,
    [session.sub]
  );

  if (res.rowCount === 0 || res.rows[0].account_status !== "ACTIVE") {
    throw new DomainError("UNAUTHORIZED", "Akun tidak ditemukan atau tidak aktif.", 401);
  }

  const user = res.rows[0];
  return {
    userId: user.id,
    phoneNumber: user.phone_number,
    fullName: user.full_name,
    kycStatus: user.kyc_status,
    role: user.role,
    biometricEnabled: user.biometric_enabled,
    activeDeviceId: user.active_device_id,
  };
}

