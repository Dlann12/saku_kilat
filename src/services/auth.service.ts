import crypto from "node:crypto";
import { getPool, withTransaction } from "@/db/pool";
import { kvStore } from "@/lib/redis";
import {
  encryptNik,
  generateNumericOtp,
  hashNik,
  hashPin,
  normalizePhoneNumber,
  verifyPin,
} from "@/lib/crypto";
import {
  issueTxAuthToken,
  signSessionJwt,
} from "@/lib/auth";
import { DomainError } from "@/lib/ledger";

const OTP_TTL_SECONDS = 180;
const LOCKOUT_SECONDS = 15 * 60;
const MAX_OTP_ATTEMPTS = 3;
const MAX_PIN_ATTEMPTS = 5;

export async function requestOtp(params: {
  phoneNumber: string;
  channel: "WHATSAPP" | "SMS";
}) {
  const phone = normalizePhoneNumber(params.phoneNumber);
  const lockKey = `otp_lock:${phone}`;
  const locked = await kvStore.get(lockKey);
  if (locked) {
    const remaining = await kvStore.ttl(lockKey);
    throw new DomainError(
      "OTP_LOCKED",
      `Nomor HP diblokir sementara karena 3x salah OTP. Coba lagi dalam ${Math.ceil(remaining / 60)} menit.`,
      429,
      { retryAfterSeconds: remaining }
    );
  }

  const code = generateNumericOtp(6);
  await kvStore.set(
    `otp_code:${phone}`,
    JSON.stringify({ code, channel: params.channel, issuedAt: Date.now() }),
    OTP_TTL_SECONDS
  );
  await kvStore.del(`otp_fail:${phone}`);

  const existing = await getPool().query<{ id: string }>(
    `SELECT id FROM users WHERE phone_number = $1`,
    [phone]
  );

  if (existing.rowCount && existing.rows[0]) {
    await getPool().query(
      `INSERT INTO notifications (user_id, channel, title, body, metadata)
       VALUES ($1, $2, 'Kode OTP SakuKilat', $3, $4)`,
      [
        existing.rows[0].id,
        params.channel,
        `Kode OTP Anda adalah ${code}. Berlaku 180 detik. Jangan bagikan ke siapa pun.`,
        JSON.stringify({ type: "OTP" }),
      ]
    );
  }

  return {
    phone_number: phone,
    channel: params.channel,
    expires_in_seconds: OTP_TTL_SECONDS,
    is_registered: Boolean(existing.rowCount && existing.rowCount > 0),
    ...(process.env.SANDBOX_OTP_PREVIEW !== "false" ? { sandbox_otp: code } : {}),
  };
}

export async function verifyOtp(params: {
  phoneNumber: string;
  otpCode: string;
  purpose: "REGISTER" | "LOGIN";
  deviceId?: string;
}) {
  const phone = normalizePhoneNumber(params.phoneNumber);
  const lockKey = `otp_lock:${phone}`;
  const locked = await kvStore.get(lockKey);
  if (locked) {
    const remaining = await kvStore.ttl(lockKey);
    throw new DomainError(
      "OTP_LOCKED",
      "Nomor HP diblokir 15 menit karena 3x salah memasukkan OTP.",
      429,
      { retryAfterSeconds: remaining }
    );
  }

  const raw = await kvStore.get(`otp_code:${phone}`);
  if (!raw) {
    throw new DomainError(
      "OTP_EXPIRED",
      "Kode OTP sudah kedaluwarsa atau belum diminta. Silakan minta ulang.",
      400
    );
  }

  const parsed = JSON.parse(raw) as { code: string };
  if (parsed.code !== params.otpCode.trim()) {
    const fails = await kvStore.incrWithTtl(`otp_fail:${phone}`, LOCKOUT_SECONDS);
    if (fails >= MAX_OTP_ATTEMPTS) {
      await kvStore.set(lockKey, "1", LOCKOUT_SECONDS);
      await kvStore.del(`otp_code:${phone}`);
      throw new DomainError(
        "OTP_LOCKED",
        "Salah OTP 3x. Nomor Anda diblokir selama 15 menit demi keamanan.",
        429,
        { retryAfterSeconds: LOCKOUT_SECONDS, attemptsRemaining: 0 }
      );
    }
    throw new DomainError(
      "INVALID_OTP",
      `Kode OTP salah. Sisa percobaan: ${MAX_OTP_ATTEMPTS - fails}x.`,
      422,
      { attemptsRemaining: MAX_OTP_ATTEMPTS - fails }
    );
  }

  await kvStore.del(`otp_code:${phone}`);
  await kvStore.del(`otp_fail:${phone}`);

  if (params.purpose === "LOGIN") {
    const userRes = await getPool().query<{
      id: string;
      phone_number: string;
      full_name: string;
      role: string;
      kyc_status: string;
    }>(
      `SELECT id, phone_number, full_name, role, kyc_status FROM users WHERE phone_number = $1`,
      [phone]
    );
    if (userRes.rowCount && userRes.rows[0]) {
      const user = userRes.rows[0];
      const deviceId = params.deviceId || `web-${crypto.randomBytes(4).toString("hex")}`;
      await getPool().query(
        `UPDATE users SET active_device_id = $1, updated_at = NOW() WHERE id = $2`,
        [deviceId, user.id]
      );
      const token = signSessionJwt({
        sub: user.id,
        phone: user.phone_number,
        role: user.role,
        deviceId,
      });
      return {
        verified: true,
        mode: "LOGIN",
        token,
        user,
      };
    }
  }

  const regToken = `reg_${crypto.randomBytes(24).toString("hex")}`;
  await kvStore.set(`reg_token:${regToken}`, phone, 600);
  return {
    verified: true,
    mode: "REGISTER",
    registration_token: regToken,
    phone_number: phone,
  };
}

export async function registerWithPin(params: {
  phoneNumber: string;
  fullName: string;
  email?: string;
  pin: string;
  registrationToken: string;
  deviceId?: string;
}) {
  const phone = normalizePhoneNumber(params.phoneNumber);
  const storedPhone = await kvStore.get(`reg_token:${params.registrationToken}`);
  if (!storedPhone || storedPhone !== phone) {
    throw new DomainError(
      "INVALID_REG_TOKEN",
      "Token verifikasi OTP tidak valid atau sudah kedaluwarsa.",
      401
    );
  }

  const pinHash = hashPin(params.pin);
  const deviceId = params.deviceId || `web-${crypto.randomBytes(4).toString("hex")}`;

  const created = await withTransaction(async (client) => {
    const exists = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE phone_number = $1`,
      [phone]
    );
    if (exists.rowCount && exists.rowCount > 0) {
      throw new DomainError("PHONE_ALREADY_REGISTERED", "Nomor HP sudah terdaftar.", 409);
    }

    const userRes = await client.query<{
      id: string;
      phone_number: string;
      full_name: string;
      email: string | null;
      kyc_status: string;
      role: string;
    }>(
      `INSERT INTO users (phone_number, full_name, email, pin_hash, kyc_status, active_device_id)
       VALUES ($1,$2,$3,$4,'UNVERIFIED',$5)
       RETURNING id, phone_number, full_name, email, kyc_status, role`,
      [phone, params.fullName.trim(), params.email || null, pinHash, deviceId]
    );
    const user = userRes.rows[0];

    await client.query(
      `INSERT INTO wallets (user_id, wallet_type, name, category_key, balance)
       VALUES ($1, 'MAIN', 'Saldo Utama', 'main', 0.00)`,
      [user.id]
    );

    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES ($1, 'IN_APP', 'Selamat Datang di SakuKilat', 'Dompet utama Anda telah aktif dengan limit Rp2.000.000. Lakukan KYC e-KTP untuk menaikkan limit hingga Rp20.000.000.')`,
      [user.id]
    );

    return user;
  });

  await kvStore.del(`reg_token:${params.registrationToken}`);

  const token = signSessionJwt({
    sub: created.id,
    phone: created.phone_number,
    role: created.role,
    deviceId,
  });

  return { user: created, token };
}

export async function loginWithPin(params: {
  phoneNumber: string;
  pin: string;
  deviceId?: string;
}) {
  const phone = normalizePhoneNumber(params.phoneNumber);
  const pool = getPool();

  const res = await pool.query<{
    id: string;
    phone_number: string;
    full_name: string;
    pin_hash: string;
    pin_attempts: number;
    pin_locked_until: Date | null;
    kyc_status: string;
    role: string;
    active_device_id: string | null;
    account_status: string;
  }>(
    `SELECT id, phone_number, full_name, pin_hash, pin_attempts, pin_locked_until, kyc_status, role, active_device_id, account_status
     FROM users WHERE phone_number = $1`,
    [phone]
  );

  if (res.rowCount === 0 || res.rows[0].account_status !== "ACTIVE") {
    throw new DomainError("INVALID_CREDENTIALS", "Nomor HP atau PIN tidak sesuai.", 401);
  }

  const user = res.rows[0];
  if (user.pin_locked_until && user.pin_locked_until > new Date()) {
    const secs = Math.ceil((user.pin_locked_until.getTime() - Date.now()) / 1000);
    throw new DomainError(
      "PIN_LOCKED",
      `Akun terkunci sementara karena salah PIN berulang. Coba lagi dalam ${Math.ceil(secs / 60)} menit.`,
      429
    );
  }

  if (!verifyPin(params.pin, user.pin_hash)) {
    const nextAttempts = user.pin_attempts + 1;
    const lockedUntil =
      nextAttempts >= MAX_PIN_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_SECONDS * 1000)
        : null;
    await pool.query(
      `UPDATE users SET pin_attempts = $1, pin_locked_until = $2, updated_at = NOW() WHERE id = $3`,
      [nextAttempts, lockedUntil, user.id]
    );
    if (lockedUntil) {
      throw new DomainError(
        "PIN_LOCKED",
        "PIN salah 5x. Akun diblokir selama 15 menit.",
        429
      );
    }
    throw new DomainError(
      "INVALID_CREDENTIALS",
      `PIN salah. Sisa percobaan: ${MAX_PIN_ATTEMPTS - nextAttempts}x.`,
      401
    );
  }

  const deviceId = params.deviceId || user.active_device_id || `web-${crypto.randomBytes(4).toString("hex")}`;
  const deviceChanged = Boolean(user.active_device_id && user.active_device_id !== deviceId);

  await pool.query(
    `UPDATE users SET pin_attempts = 0, pin_locked_until = NULL, active_device_id = $1, updated_at = NOW() WHERE id = $2`,
    [deviceId, user.id]
  );

  if (deviceChanged) {
    await pool.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES ($1, 'IN_APP', 'Perangkat Aktif Diperbarui', $2)`,
      [user.id, `Sesi login berpindah ke perangkat ${deviceId} (Device Binding aktif).`]
    );
  }

  const token = signSessionJwt({
    sub: user.id,
    phone: user.phone_number,
    role: user.role,
    deviceId,
  });

  return {
    token,
    deviceChanged,
    user: {
      id: user.id,
      phone_number: user.phone_number,
      full_name: user.full_name,
      kyc_status: user.kyc_status,
      role: user.role,
    },
  };
}

export async function verifyPinForTx(userId: string, pin: string) {
  const pool = getPool();
  const res = await pool.query<{
    pin_hash: string;
    pin_attempts: number;
    pin_locked_until: Date | null;
  }>(`SELECT pin_hash, pin_attempts, pin_locked_until FROM users WHERE id = $1`, [userId]);

  if (res.rowCount === 0) {
    throw new DomainError("UNAUTHORIZED", "Pengguna tidak ditemukan.", 401);
  }

  const row = res.rows[0];
  if (row.pin_locked_until && row.pin_locked_until > new Date()) {
    throw new DomainError(
      "PIN_LOCKED",
      "Otorisasi PIN dikunci sementara selama 15 menit karena 5x percobaan gagal.",
      429
    );
  }

  if (!verifyPin(pin, row.pin_hash)) {
    const nextAttempts = row.pin_attempts + 1;
    const lockedUntil =
      nextAttempts >= MAX_PIN_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_SECONDS * 1000)
        : null;
    await pool.query(
      `UPDATE users SET pin_attempts = $1, pin_locked_until = $2, updated_at = NOW() WHERE id = $3`,
      [nextAttempts, lockedUntil, userId]
    );
    throw new DomainError(
      "INVALID_PIN",
      `PIN transaksi salah (${nextAttempts}/${MAX_PIN_ATTEMPTS}).`,
      401
    );
  }

  await pool.query(
    `UPDATE users SET pin_attempts = 0, pin_locked_until = NULL, updated_at = NOW() WHERE id = $1`,
    [userId]
  );

  return issueTxAuthToken(userId);
}

export async function toggleBiometric(userId: string, enabled: boolean) {
  await getPool().query(
    `UPDATE users SET biometric_enabled = $1, updated_at = NOW() WHERE id = $2`,
    [enabled, userId]
  );
  return { biometric_enabled: enabled };
}

export async function authorizeBiometricTx(userId: string) {
  const res = await getPool().query<{ biometric_enabled: boolean }>(
    `SELECT biometric_enabled FROM users WHERE id = $1`,
    [userId]
  );
  if (res.rowCount === 0 || !res.rows[0].biometric_enabled) {
    throw new DomainError(
      "BIOMETRIC_DISABLED",
      "Otorisasi biometrik belum diaktifkan pada akun ini.",
      403
    );
  }
  return issueTxAuthToken(userId);
}

export async function submitKyc(params: {
  userId: string;
  nik: string;
  fullNameKtp: string;
  ktpImageUrl: string;
  selfieImageUrl: string;
}) {
  const nikEncrypted = encryptNik(params.nik);
  const nikHash = hashNik(params.nik);

  return withTransaction(async (client) => {
    const dup = await client.query<{ user_id: string }>(
      `SELECT user_id FROM kyc_documents WHERE nik_hash = $1 AND status = 'VERIFIED' AND user_id <> $2`,
      [nikHash, params.userId]
    );
    if (dup.rowCount && dup.rowCount > 0) {
      throw new DomainError(
        "NIK_ALREADY_USED",
        "NIK e-KTP ini sudah terverifikasi pada akun lain.",
        409
      );
    }

    const docRes = await client.query<{
      id: string;
      status: string;
      created_at: Date;
    }>(
      `INSERT INTO kyc_documents (user_id, nik_encrypted, nik_hash, full_name_ktp, ktp_image_url, selfie_image_url, liveness_score, status)
       VALUES ($1,$2,$3,$4,$5,$6,98.80,'PENDING')
       RETURNING id, status, created_at`,
      [
        params.userId,
        nikEncrypted,
        nikHash,
        params.fullNameKtp.toUpperCase(),
        params.ktpImageUrl,
        params.selfieImageUrl,
      ]
    );

    await client.query(
      `UPDATE users SET kyc_status = 'PENDING', updated_at = NOW() WHERE id = $1`,
      [params.userId]
    );

    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES ($1, 'IN_APP', 'Pengajuan KYC Diproses', 'Dokumen e-KTP dan verifikasi wajah Anda sedang ditinjau oleh tim kepatuhan.')`,
      [params.userId]
    );

    return docRes.rows[0];
  });
}

export async function reviewKyc(params: {
  documentId: string;
  decision: "VERIFIED" | "REJECTED";
  rejectionReason?: string;
}) {
  return withTransaction(async (client) => {
    const res = await client.query<{ id: string; user_id: string; status: string }>(
      `SELECT id, user_id, status FROM kyc_documents WHERE id = $1 FOR UPDATE`,
      [params.documentId]
    );
    if (res.rowCount === 0) {
      throw new DomainError("KYC_NOT_FOUND", "Dokumen KYC tidak ditemukan.", 404);
    }
    const doc = res.rows[0];

    await client.query(
      `UPDATE kyc_documents
       SET status = $1::varchar,
           rejection_reason = $2,
           verified_at = CASE WHEN $1::text = 'VERIFIED' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $3`,
      [params.decision, params.rejectionReason || null, doc.id]
    );

    await client.query(
      `UPDATE users SET kyc_status = $1::varchar, updated_at = NOW() WHERE id = $2`,
      [params.decision, doc.user_id]
    );

    const msg =
      params.decision === "VERIFIED"
        ? "KYC Disetujui! Limit saldo Anda naik menjadi Rp20.000.000 dan fitur Transfer Bank BI-FAST kini aktif."
        : `Pengajuan KYC ditolak: ${params.rejectionReason || "Foto e-KTP kurang jelas."}`;

    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES ($1, 'IN_APP', $2, $3)`,
      [
        doc.user_id,
        params.decision === "VERIFIED" ? "KYC Berhasil Diverifikasi" : "KYC Perlu Diulang",
        msg,
      ]
    );

    return { document_id: doc.id, user_id: doc.user_id, kyc_status: params.decision };
  });
}

export async function getProfileSummary(userId: string) {
  const pool = getPool();
  const userRes = await pool.query<{
    id: string;
    phone_number: string;
    full_name: string;
    email: string | null;
    kyc_status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
    role: string;
    biometric_enabled: boolean;
    active_device_id: string | null;
    created_at: Date;
  }>(
    `SELECT id, phone_number, full_name, email, kyc_status, role, biometric_enabled, active_device_id, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (userRes.rowCount === 0) {
    throw new DomainError("NOT_FOUND", "User tidak ditemukan.", 404);
  }
  const user = userRes.rows[0];
  const kycRes = await pool.query<{
    id: string;
    full_name_ktp: string;
    status: string;
    rejection_reason: string | null;
    verified_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, full_name_ktp, status, rejection_reason, verified_at, created_at
     FROM kyc_documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  const notifRes = await pool.query<{
    id: string;
    channel: string;
    title: string;
    body: string;
    is_read: boolean;
    created_at: Date;
  }>(
    `SELECT id, channel, title, body, is_read, created_at
     FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );

  const balanceLimit = user.kyc_status === "VERIFIED" ? 20_000_000 : 2_000_000;

  return {
    user,
    balanceLimit,
    latestKyc: kycRes.rows[0] || null,
    notifications: notifRes.rows,
  };
}
