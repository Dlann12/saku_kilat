import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, withTransaction } from "@/db/pool";
import {
  DomainError,
  executeDoubleEntryInTx,
  getSystemWalletId,
} from "@/lib/ledger";
import { verifyHmacSha256 } from "@/lib/crypto";

export const UNVERIFIED_BALANCE_LIMIT = 2_000_000;
export const VERIFIED_BALANCE_LIMIT = 20_000_000;
export const BIFAST_MONTHLY_FREE_QUOTA = 10;
export const BIFAST_ADMIN_FEE = 2_500;

export const TOPUP_CHANNELS: Record<
  string,
  { label: string; prefix: string; adminFee: number; kind: "VA" | "RETAIL" | "DEBIT" }
> = {
  VA_BCA: { label: "BCA Virtual Account", prefix: "39010", adminFee: 0, kind: "VA" },
  VA_MANDIRI: { label: "Mandiri Virtual Account", prefix: "88011", adminFee: 0, kind: "VA" },
  VA_BNI: { label: "BNI Virtual Account", prefix: "88100", adminFee: 0, kind: "VA" },
  VA_BRI: { label: "BRI Virtual Account", prefix: "88810", adminFee: 0, kind: "VA" },
  VA_BSI: { label: "BSI Virtual Account", prefix: "90018", adminFee: 0, kind: "VA" },
  RETAIL_ALFAMART: { label: "Gerai Alfamart", prefix: "ALFA", adminFee: 2500, kind: "RETAIL" },
  RETAIL_INDOMARET: { label: "Gerai Indomaret", prefix: "INDM", adminFee: 2500, kind: "RETAIL" },
  DEBIT_INSTANT: { label: "Kartu Debit Instan", prefix: "DBT", adminFee: 1000, kind: "DEBIT" },
};

export async function getUserBalanceLimitInfo(
  client: PoolClient,
  userId: string
): Promise<{
  kycStatus: string;
  currentTotalBalance: number;
  balanceLimit: number;
}> {
  const userRes = await client.query<{ kyc_status: string }>(
    `SELECT kyc_status FROM users WHERE id = $1`,
    [userId]
  );
  if (userRes.rowCount === 0) {
    throw new DomainError("USER_NOT_FOUND", "Pengguna tidak ditemukan.", 404);
  }
  const kycStatus = userRes.rows[0].kyc_status;
  const balanceLimit =
    kycStatus === "VERIFIED" ? VERIFIED_BALANCE_LIMIT : UNVERIFIED_BALANCE_LIMIT;

  const balRes = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(balance), 0)::text AS total
     FROM wallets
     WHERE user_id = $1 AND wallet_type IN ('MAIN', 'POCKET')`,
    [userId]
  );
  return {
    kycStatus,
    currentTotalBalance: parseFloat(balRes.rows[0].total),
    balanceLimit,
  };
}

export async function getMonthlyBiFastUsage(
  client: PoolClient,
  userId: string
): Promise<{ usedThisMonth: number; freeQuota: number; remainingFree: number }> {
  const res = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM transactions
     WHERE user_id = $1
       AND transaction_type = 'TRANSFER_BANK'
       AND status = 'SUCCESS'
       AND date_trunc('month', created_at AT TIME ZONE 'Asia/Jakarta') =
           date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')`,
    [userId]
  );
  const used = parseInt(res.rows[0].cnt, 10) || 0;
  return {
    usedThisMonth: used,
    freeQuota: BIFAST_MONTHLY_FREE_QUOTA,
    remainingFree: Math.max(0, BIFAST_MONTHLY_FREE_QUOTA - used),
  };
}

export async function listUserWallets(userId: string) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const walletsRes = await client.query<{
      id: string;
      wallet_type: string;
      name: string;
      category_key: string;
      balance: string;
      target_amount: string | null;
      daily_limit: string | null;
      currency: string;
      is_locked: boolean;
      created_at: Date;
    }>(
      `SELECT id, wallet_type, name, category_key, balance::text, target_amount::text, daily_limit::text, currency, is_locked, created_at
       FROM wallets
       WHERE user_id = $1
       ORDER BY CASE wallet_type WHEN 'MAIN' THEN 0 WHEN 'POCKET' THEN 1 ELSE 2 END, created_at ASC`,
      [userId]
    );

    const wallets = walletsRes.rows.map((w) => ({
      id: w.id,
      walletType: w.wallet_type,
      name: w.name,
      categoryKey: w.category_key,
      balance: parseFloat(w.balance),
      targetAmount: w.target_amount ? parseFloat(w.target_amount) : null,
      dailyLimit: w.daily_limit ? parseFloat(w.daily_limit) : null,
      currency: w.currency,
      isLocked: w.is_locked,
    }));

    const mainWallet = wallets.find((w) => w.walletType === "MAIN") || null;
    const pockets = wallets.filter((w) => w.walletType === "POCKET");
    const mainBalance = mainWallet ? mainWallet.balance : 0;
    const pocketsTotal = pockets.reduce((acc, p) => acc + p.balance, 0);

    const limitInfo = await getUserBalanceLimitInfo(client, userId);
    const biFastQuota = await getMonthlyBiFastUsage(client, userId);

    const pendingOrdersRes = await client.query<{
      id: string;
      channel: string;
      channel_label: string;
      va_number: string;
      amount: string;
      admin_fee: string;
      status: string;
      external_ref: string;
      failure_reason: string | null;
      created_at: Date;
    }>(
      `SELECT id, channel, channel_label, va_number, amount::text, admin_fee::text, status, external_ref, failure_reason, created_at
       FROM topup_orders
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    return {
      mainBalance,
      pocketsTotal,
      totalBalance: mainBalance + pocketsTotal,
      balanceLimit: limitInfo.balanceLimit,
      kycStatus: limitInfo.kycStatus,
      biFastQuota,
      mainWallet,
      pockets,
      wallets,
      topupOrders: pendingOrdersRes.rows.map((o) => ({
        id: o.id,
        channel: o.channel,
        channelLabel: o.channel_label,
        vaNumber: o.va_number,
        amount: parseFloat(o.amount),
        adminFee: parseFloat(o.admin_fee),
        status: o.status,
        externalRef: o.external_ref,
        failureReason: o.failure_reason,
        createdAt: o.created_at.toISOString(),
      })),
    };
  } finally {
    client.release();
  }
}

export async function createSmartPocket(params: {
  userId: string;
  name: string;
  categoryKey: "food" | "transport" | "savings" | "bills";
  targetAmount?: number;
}) {
  const pool = getPool();
  const countRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM wallets WHERE user_id = $1 AND wallet_type = 'POCKET'`,
    [params.userId]
  );
  if (parseInt(countRes.rows[0].cnt, 10) >= 12) {
    throw new DomainError(
      "POCKET_LIMIT_REACHED",
      "Maksimal 12 Kantong Pintar aktif per akun.",
      422
    );
  }

  const res = await pool.query<{
    id: string;
    wallet_type: string;
    name: string;
    category_key: string;
    balance: string;
    target_amount: string | null;
    is_locked: boolean;
  }>(
    `INSERT INTO wallets (user_id, wallet_type, name, category_key, balance, target_amount)
     VALUES ($1, 'POCKET', $2, $3, 0.00, $4)
     RETURNING id, wallet_type, name, category_key, balance::text, target_amount::text, is_locked`,
    [
      params.userId,
      params.name.trim(),
      params.categoryKey,
      params.targetAmount ? params.targetAmount.toFixed(2) : null,
    ]
  );
  const w = res.rows[0];
  return {
    id: w.id,
    walletType: w.wallet_type,
    name: w.name,
    categoryKey: w.category_key,
    balance: parseFloat(w.balance),
    targetAmount: w.target_amount ? parseFloat(w.target_amount) : null,
    isLocked: w.is_locked,
  };
}

export async function updateSmartPocket(params: {
  userId: string;
  pocketId: string;
  name?: string;
  targetAmount?: number | null;
  isLocked?: boolean;
}) {
  const pool = getPool();
  const existing = await pool.query<{ id: string; wallet_type: string }>(
    `SELECT id, wallet_type FROM wallets WHERE id = $1 AND user_id = $2`,
    [params.pocketId, params.userId]
  );
  if (existing.rowCount === 0) {
    throw new DomainError("WALLET_NOT_FOUND", "Kantong tidak ditemukan.", 404);
  }
  if (existing.rows[0].wallet_type !== "POCKET") {
    throw new DomainError("INVALID_WALLET_TYPE", "Hanya Kantong Pintar yang dapat diubah.", 400);
  }

  const res = await pool.query<{
    id: string;
    name: string;
    category_key: string;
    balance: string;
    target_amount: string | null;
    is_locked: boolean;
  }>(
    `UPDATE wallets
     SET name = COALESCE($1, name),
         target_amount = CASE WHEN $2::boolean THEN $3::numeric ELSE target_amount END,
         is_locked = COALESCE($4, is_locked),
         updated_at = NOW()
     WHERE id = $5 AND user_id = $6
     RETURNING id, name, category_key, balance::text, target_amount::text, is_locked`,
    [
      params.name ?? null,
      params.targetAmount !== undefined,
      params.targetAmount !== undefined && params.targetAmount !== null
        ? params.targetAmount.toFixed(2)
        : null,
      params.isLocked ?? null,
      params.pocketId,
      params.userId,
    ]
  );
  const w = res.rows[0];
  return {
    id: w.id,
    name: w.name,
    categoryKey: w.category_key,
    balance: parseFloat(w.balance),
    targetAmount: w.target_amount ? parseFloat(w.target_amount) : null,
    isLocked: w.is_locked,
  };
}

export async function movePocketBalance(params: {
  userId: string;
  sourceWalletId: string;
  destinationWalletId: string;
  amount: number;
  idempotencyKey: string;
}) {
  if (params.sourceWalletId === params.destinationWalletId) {
    throw new DomainError("SAME_WALLET", "Dompet sumber dan tujuan tidak boleh sama.", 400);
  }

  return withTransaction(async (client) => {
    const ownRes = await client.query<{
      id: string;
      name: string;
      wallet_type: string;
      is_locked: boolean;
    }>(
      `SELECT id, name, wallet_type, is_locked
       FROM wallets
       WHERE id = ANY($1::uuid[]) AND user_id = $2`,
      [[params.sourceWalletId, params.destinationWalletId], params.userId]
    );
    if (ownRes.rowCount !== 2) {
      throw new DomainError(
        "WALLET_OWNERSHIP_ERROR",
        "Pemindahan saldo hanya dapat dilakukan antar dompet milik Anda sendiri.",
        403
      );
    }

    const src = ownRes.rows.find((w) => w.id === params.sourceWalletId)!;
    const dst = ownRes.rows.find((w) => w.id === params.destinationWalletId)!;

    return executeDoubleEntryInTx(client, {
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      transactionType: "POCKET_MOVE",
      amount: params.amount,
      adminFee: 0,
      title: `Pindah Saldo: ${src.name} -> ${dst.name}`,
      category: "Kantong Pintar",
      sourceWalletId: src.id,
      destinationWalletId: dst.id,
      metadata: {
        sourceName: src.name,
        destinationName: dst.name,
      },
      legs: [
        {
          walletId: src.id,
          entryType: "DEBIT",
          amount: params.amount,
          description: `Pindah keluar ke ${dst.name}`,
        },
        {
          walletId: dst.id,
          entryType: "CREDIT",
          amount: params.amount,
          description: `Terima alokasi dari ${src.name}`,
        },
      ],
    });
  });
}

export async function createTopupOrder(params: {
  userId: string;
  channel: string;
  amount: number;
}) {
  const cfg = TOPUP_CHANNELS[params.channel];
  if (!cfg) {
    throw new DomainError("INVALID_CHANNEL", "Kanal Top Up tidak dikenal.", 400);
  }

  const pool = getPool();
  const userRes = await pool.query<{ phone_number: string }>(
    `SELECT phone_number FROM users WHERE id = $1`,
    [params.userId]
  );
  if (userRes.rowCount === 0) {
    throw new DomainError("USER_NOT_FOUND", "User tidak ditemukan.", 404);
  }

  const digits = userRes.rows[0].phone_number.replace(/\D/g, "").slice(-8);
  const randSuffix = crypto.randomInt(100, 999);
  const vaNumber =
    cfg.kind === "VA"
      ? `${cfg.prefix}${digits}`
      : `${cfg.prefix}-${digits.slice(-4)}-${randSuffix}`;
  const externalRef = `TOPUP-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  const res = await pool.query<{
    id: string;
    channel: string;
    channel_label: string;
    va_number: string;
    amount: string;
    admin_fee: string;
    status: string;
    external_ref: string;
    created_at: Date;
  }>(
    `INSERT INTO topup_orders (user_id, channel, channel_label, va_number, amount, admin_fee, status, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7)
     RETURNING id, channel, channel_label, va_number, amount::text, admin_fee::text, status, external_ref, created_at`,
    [
      params.userId,
      params.channel,
      cfg.label,
      vaNumber,
      params.amount.toFixed(2),
      cfg.adminFee.toFixed(2),
      externalRef,
    ]
  );

  const row = res.rows[0];
  return {
    id: row.id,
    channel: row.channel,
    channelLabel: row.channel_label,
    vaNumber: row.va_number,
    amount: parseFloat(row.amount),
    adminFee: parseFloat(row.admin_fee),
    totalPayable: parseFloat(row.amount) + parseFloat(row.admin_fee),
    status: row.status,
    externalRef: row.external_ref,
    createdAt: row.created_at.toISOString(),
  };
}

export async function processTopupWebhook(params: {
  externalRef: string;
  rawBody: string;
  timestamp: string;
  signature: string;
  bypassSignature?: boolean;
}) {
  if (!params.bypassSignature) {
    const check = verifyHmacSha256(params.rawBody, params.timestamp, params.signature, 30);
    if (!check.valid) {
      throw new DomainError(
        check.reason || "INVALID_WEBHOOK_SIGNATURE",
        "Tanda tangan HMAC webhook bank tidak valid atau melewati batas anti-replay 30 detik.",
        401
      );
    }
  }

  return withTransaction(async (client) => {
    const orderRes = await client.query<{
      id: string;
      user_id: string;
      channel: string;
      channel_label: string;
      va_number: string;
      amount: string;
      admin_fee: string;
      status: string;
      external_ref: string;
    }>(
      `SELECT id, user_id, channel, channel_label, va_number, amount::text, admin_fee::text, status, external_ref
       FROM topup_orders
       WHERE external_ref = $1
       FOR UPDATE`,
      [params.externalRef]
    );

    if (orderRes.rowCount === 0) {
      throw new DomainError("ORDER_NOT_FOUND", "Order Top Up tidak ditemukan.", 404);
    }
    const order = orderRes.rows[0];
    if (order.status === "PAID") {
      return { alreadyProcessed: true, orderId: order.id, status: "PAID" };
    }
    if (order.status !== "PENDING") {
      throw new DomainError(
        "INVALID_ORDER_STATUS",
        `Order Top Up berstatus ${order.status}, tidak dapat dibayar.`,
        409
      );
    }

    const creditAmount = parseFloat(order.amount);
    const adminFee = parseFloat(order.admin_fee);

    const limitInfo = await getUserBalanceLimitInfo(client, order.user_id);
    if (limitInfo.currentTotalBalance + creditAmount > limitInfo.balanceLimit) {
      await client.query(
        `UPDATE topup_orders
         SET status = 'REJECTED', failure_reason = 'LIMIT_EXCEEDED'
         WHERE id = $1`,
        [order.id]
      );
      await client.query(
        `INSERT INTO notifications (user_id, channel, title, body)
         VALUES ($1, 'IN_APP', 'Top Up Ditolak (Batas Saldo)', $2)`,
        [
          order.user_id,
          `Top Up Rp${creditAmount.toLocaleString("id-ID")} ditolak karena melebihi batas saldo akun ${limitInfo.kycStatus} (maks Rp${limitInfo.balanceLimit.toLocaleString("id-ID")}).`,
        ]
      );
      throw new DomainError(
        "LIMIT_EXCEEDED",
        `Top Up ditolak: total saldo akan melebihi batas maksimal akun ${limitInfo.kycStatus} (Rp${limitInfo.balanceLimit.toLocaleString("id-ID")}). Lakukan verifikasi KYC untuk batas Rp20.000.000.`,
        422,
        limitInfo
      );
    }

    const mainRes = await client.query<{ id: string }>(
      `SELECT id FROM wallets WHERE user_id = $1 AND wallet_type = 'MAIN'`,
      [order.user_id]
    );
    if (mainRes.rowCount === 0) {
      throw new DomainError("MAIN_WALLET_MISSING", "Dompet utama pengguna tidak ditemukan.", 500);
    }
    const mainWalletId = mainRes.rows[0].id;
    const escrowId = await getSystemWalletId(client, "SYSTEM_ESCROW");
    const feeId = await getSystemWalletId(client, "SYSTEM_FEE");

    const legs = [
      {
        walletId: escrowId,
        entryType: "DEBIT" as const,
        amount: creditAmount + adminFee,
        description: `Penerimaan dana ${order.channel_label} (${order.va_number})`,
      },
      {
        walletId: mainWalletId,
        entryType: "CREDIT" as const,
        amount: creditAmount,
        description: `Top Up via ${order.channel_label}`,
      },
    ];

    if (adminFee > 0) {
      legs.push({
        walletId: feeId,
        entryType: "CREDIT" as const,
        amount: adminFee,
        description: `Biaya admin Top Up ${order.channel_label}`,
      });
    }

    const committed = await executeDoubleEntryInTx(client, {
      userId: order.user_id,
      idempotencyKey: `webhook-topup-${order.external_ref}`,
      transactionType: "TOPUP",
      amount: creditAmount,
      adminFee,
      title: `Top Up via ${order.channel_label}`,
      category: "Top Up",
      sourceWalletId: escrowId,
      destinationWalletId: mainWalletId,
      metadata: {
        channel: order.channel,
        vaNumber: order.va_number,
        externalRef: order.external_ref,
      },
      legs,
    });

    await client.query(
      `UPDATE topup_orders SET status = 'PAID', paid_at = NOW() WHERE id = $1`,
      [order.id]
    );

    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES ($1, 'IN_APP', 'Top Up Berhasil Masuk', $2)`,
      [
        order.user_id,
        `Saldo Utama bertambah +Rp${creditAmount.toLocaleString("id-ID")} dari ${order.channel_label}.`,
      ]
    );

    return {
      alreadyProcessed: false,
      orderId: order.id,
      status: "PAID",
      transaction: committed,
    };
  });
}
