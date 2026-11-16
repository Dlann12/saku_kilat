import crypto from "node:crypto";
import { getPool, withTransaction } from "@/db/pool";
import { kvStore } from "@/lib/redis";
import {
  DomainError,
  executeDoubleEntryInTx,
  getSystemWalletId,
} from "@/lib/ledger";
import { consumeTxAuthToken } from "@/lib/auth";
import { maskRecipientName, normalizePhoneNumber } from "@/lib/crypto";
import { parseQrisPayload } from "@/lib/qris";
import {
  BIFAST_ADMIN_FEE,
  BIFAST_MONTHLY_FREE_QUOTA,
  getMonthlyBiFastUsage,
  getUserBalanceLimitInfo,
} from "@/services/wallet.service";

export interface PpobProduct {
  code: string;
  category: "PULSA" | "DATA" | "PLN_TOKEN" | "PLN_BILL" | "BPJS" | "PDAM" | "GAME";
  name: string;
  provider: string;
  basePrice: number;
  adminFee: number;
  description: string;
}

export const PPOB_CATALOG: PpobProduct[] = [
  { code: "PULSA_TSEL_25", category: "PULSA", name: "Pulsa Telkomsel 25.000", provider: "Telkomsel", basePrice: 24500, adminFee: 1500, description: "Masa aktif +30 hari" },
  { code: "PULSA_TSEL_50", category: "PULSA", name: "Pulsa Telkomsel 50.000", provider: "Telkomsel", basePrice: 49000, adminFee: 1500, description: "Masa aktif +45 hari" },
  { code: "DATA_ISAT_12GB", category: "DATA", name: "Freedom Internet 12 GB / 30 Hari", provider: "Indosat Ooredoo", basePrice: 48000, adminFee: 2000, description: "Kuota utama 24 jam" },
  { code: "DATA_XL_20GB", category: "DATA", name: "Xtra Combo Flex 20 GB", provider: "XL Axiata", basePrice: 63000, adminFee: 2000, description: "Kuota utama + bonus area" },
  { code: "PLN_TOKEN_50", category: "PLN_TOKEN", name: "Token Listrik PLN Rp50.000", provider: "PLN Prabayar", basePrice: 50000, adminFee: 2500, description: "Terbit 20 digit kode stroom instan" },
  { code: "PLN_TOKEN_100", category: "PLN_TOKEN", name: "Token Listrik PLN Rp100.000", provider: "PLN Prabayar", basePrice: 100000, adminFee: 2500, description: "Terbit 20 digit kode stroom instan" },
  { code: "PLN_TOKEN_200", category: "PLN_TOKEN", name: "Token Listrik PLN Rp200.000", provider: "PLN Prabayar", basePrice: 200000, adminFee: 2500, description: "Terbit 20 digit kode stroom instan" },
  { code: "PLN_PASCABAYAR", category: "PLN_BILL", name: "Tagihan Listrik Pascabayar", provider: "PLN", basePrice: 184500, adminFee: 3000, description: "Tagihan bulanan periode berjalan" },
  { code: "BPJS_KES", category: "BPJS", name: "Iuran BPJS Kesehatan Kelas I/II/III", provider: "BPJS Kesehatan", basePrice: 100000, adminFee: 2500, description: "Pembayaran iuran peserta JKN-KIS" },
  { code: "PDAM_AIR", category: "PDAM", name: "Tagihan Air PDAM Tirta", provider: "PDAM Nasional", basePrice: 72500, adminFee: 2500, description: "Tagihan pemakaian air bersih" },
  { code: "GAME_MLBB_172", category: "GAME", name: "Mobile Legends 172 Diamonds", provider: "Moonton", basePrice: 45000, adminFee: 2000, description: "Top up instan ke User ID + Zone" },
  { code: "GAME_STEAM_60", category: "GAME", name: "Steam Wallet Code IDR 60.000", provider: "Valve Steam", basePrice: 60000, adminFee: 3500, description: "Kode redeem dikirim di resi" },
];

export async function decodeQris(rawPayload: string) {
  const parsed = parseQrisPayload(rawPayload);
  if (!parsed.valid) {
    throw new DomainError(
      "INVALID_QRIS",
      "Kode QR tidak valid atau bukan format QRIS standar nasional / SakuKilat.",
      422
    );
  }

  if (parsed.kind === "PROFILE" && parsed.profilePhone) {
    const recipient = await lookupP2pRecipient(parsed.profilePhone);
    return {
      kind: "PROFILE" as const,
      ...recipient,
    };
  }

  const pool = getPool();
  const merchantRes = await pool.query<{
    id: string;
    nmid: string;
    merchant_name: string;
    merchant_city: string;
    category: string;
    category_scale: string;
    mdr_bps: number;
    settlement_wallet_id: string;
  }>(
    `SELECT id, nmid, merchant_name, merchant_city, category, category_scale, mdr_bps, settlement_wallet_id
     FROM merchants
     WHERE nmid = $1 OR LOWER(merchant_name) = LOWER($2)
     LIMIT 1`,
    [parsed.nmid, parsed.merchantName]
  );

  const merchant = merchantRes.rows[0] || null;
  const inquiryId = `qri_${crypto.randomBytes(12).toString("hex")}`;

  const inquiryData = {
    inquiryId,
    nmid: merchant?.nmid || parsed.nmid,
    merchantId: merchant?.id || null,
    merchantName: merchant?.merchant_name || parsed.merchantName,
    merchantCity: merchant?.merchant_city || parsed.merchantCity,
    category: merchant?.category || "Merchant QRIS",
    categoryScale: merchant?.category_scale || "UMI",
    mdrBps: merchant?.mdr_bps ?? 70,
    settlementWalletId: merchant?.settlement_wallet_id || null,
    isDynamic: parsed.isDynamic,
    amount: parsed.amount,
    rawPayload: parsed.rawPayload,
  };

  await kvStore.set(`qris_inquiry:${inquiryId}`, JSON.stringify(inquiryData), 300);

  return {
    kind: "QRIS" as const,
    inquiryId,
    nmid: inquiryData.nmid,
    merchantName: inquiryData.merchantName,
    merchantCity: inquiryData.merchantCity,
    category: inquiryData.category,
    isDynamic: inquiryData.isDynamic,
    amount: inquiryData.amount,
    adminFee: 0,
    crcValid: parsed.crcValid,
  };
}

export async function executeQrisPayment(params: {
  userId: string;
  inquiryId?: string;
  rawQrPayload?: string;
  sourceWalletId: string;
  amount: number;
  txAuthToken: string;
  idempotencyKey: string;
}) {
  const authorized = await consumeTxAuthToken(params.txAuthToken, params.userId);
  if (!authorized) {
    throw new DomainError(
      "TX_AUTH_INVALID",
      "Token otorisasi PIN kedaluwarsa (60 detik) atau tidak valid. Konfirmasi PIN ulang.",
      401
    );
  }

  let inquiry: {
    nmid: string;
    merchantName: string;
    merchantCity: string;
    category: string;
    categoryScale: string;
    mdrBps: number;
    settlementWalletId: string | null;
    isDynamic: boolean;
    amount: number | null;
  } | null = null;

  if (params.inquiryId) {
    const cached = await kvStore.get(`qris_inquiry:${params.inquiryId}`);
    if (cached) {
      inquiry = JSON.parse(cached);
    }
  }

  if (!inquiry && params.rawQrPayload) {
    const decoded = await decodeQris(params.rawQrPayload);
    if (decoded.kind !== "QRIS") {
      throw new DomainError("INVALID_QRIS", "QR Profil tidak dapat dibayar sebagai QRIS.", 400);
    }
    const cached = await kvStore.get(`qris_inquiry:${decoded.inquiryId}`);
    if (cached) {
      inquiry = JSON.parse(cached);
    }
  }

  if (!inquiry) {
    throw new DomainError(
      "QRIS_INQUIRY_EXPIRED",
      "Sesi pemindaian QRIS kedaluwarsa. Silakan pindai ulang kode QR.",
      404
    );
  }

  if (inquiry.isDynamic && inquiry.amount && inquiry.amount !== params.amount) {
    throw new DomainError(
      "QRIS_AMOUNT_MISMATCH",
      `QRIS Dinamis mengunci nominal pembayaran sebesar Rp${inquiry.amount.toLocaleString("id-ID")}.`,
      422
    );
  }

  return withTransaction(async (client) => {
    const srcRes = await client.query<{ id: string; user_id: string; name: string }>(
      `SELECT id, user_id, name FROM wallets WHERE id = $1 AND user_id = $2`,
      [params.sourceWalletId, params.userId]
    );
    if (srcRes.rowCount === 0) {
      throw new DomainError("WALLET_NOT_FOUND", "Dompet sumber dana tidak valid.", 403);
    }

    const destinationWalletId =
      inquiry.settlementWalletId || (await getSystemWalletId(client, "SYSTEM_ESCROW"));
    const feeWalletId = await getSystemWalletId(client, "SYSTEM_FEE");

    // BI QRIS MDR rule: UMI <= Rp500.000 = 0% (or 0.3% > 500k); UME/UBE = 0.7%
    const effectiveBps =
      inquiry.categoryScale === "UMI" && params.amount <= 500_000 ? 0 : inquiry.mdrBps;
    const mdrFee = Math.round((params.amount * effectiveBps) / 10_000);
    const netMerchantAmount = params.amount - mdrFee;

    const legs = [
      {
        walletId: params.sourceWalletId,
        entryType: "DEBIT" as const,
        amount: params.amount,
        description: `Bayar QRIS ${inquiry.merchantName}`,
      },
      {
        walletId: destinationWalletId,
        entryType: "CREDIT" as const,
        amount: netMerchantAmount,
        description: `Terima QRIS net MDR (${inquiry.merchantName})`,
      },
    ];
    if (mdrFee > 0) {
      legs.push({
        walletId: feeWalletId,
        entryType: "CREDIT" as const,
        amount: mdrFee,
        description: `Issuer MDR QRIS (${effectiveBps / 100}%)`,
      });
    }

    const committed = await executeDoubleEntryInTx(client, {
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      transactionType: "QRIS",
      amount: params.amount,
      adminFee: 0,
      title: inquiry.merchantName,
      category: inquiry.category,
      sourceWalletId: params.sourceWalletId,
      destinationWalletId,
      metadata: {
        nmid: inquiry.nmid,
        merchantName: inquiry.merchantName,
        merchantCity: inquiry.merchantCity,
        isDynamic: inquiry.isDynamic,
        mdrFee,
        sourceWalletName: srcRes.rows[0].name,
      },
      legs,
    });

    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES ($1, 'IN_APP', 'Pembayaran QRIS Berhasil', $2)`,
      [
        params.userId,
        `Pembayaran Rp${params.amount.toLocaleString("id-ID")} ke ${inquiry.merchantName} dari ${srcRes.rows[0].name} berhasil.`,
      ]
    );

    return committed;
  });
}

export async function lookupP2pRecipient(rawPhone: string) {
  const phone = normalizePhoneNumber(rawPhone);
  const res = await getPool().query<{
    id: string;
    phone_number: string;
    full_name: string;
    account_status: string;
  }>(
    `SELECT id, phone_number, full_name, account_status
     FROM users
     WHERE phone_number = $1 AND role <> 'SYSTEM'`,
    [phone]
  );

  if (res.rowCount === 0 || res.rows[0].account_status !== "ACTIVE") {
    throw new DomainError(
      "RECIPIENT_NOT_FOUND",
      `Nomor ${phone} belum terdaftar di SakuKilat.`,
      404
    );
  }

  const user = res.rows[0];
  return {
    userId: user.id,
    phoneNumber: user.phone_number,
    maskedName: maskRecipientName(user.full_name),
  };
}

export async function executeP2pTransfer(params: {
  userId: string;
  recipientPhone: string;
  sourceWalletId: string;
  amount: number;
  notes?: string;
  txAuthToken: string;
  idempotencyKey: string;
}) {
  const authorized = await consumeTxAuthToken(params.txAuthToken, params.userId);
  if (!authorized) {
    throw new DomainError(
      "TX_AUTH_INVALID",
      "Token otorisasi PIN tidak valid atau kedaluwarsa (60 detik).",
      401
    );
  }

  const normalizedPhone = normalizePhoneNumber(params.recipientPhone);

  return withTransaction(async (client) => {
    const srcRes = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM wallets WHERE id = $1 AND user_id = $2`,
      [params.sourceWalletId, params.userId]
    );
    if (srcRes.rowCount === 0) {
      throw new DomainError("WALLET_NOT_FOUND", "Dompet sumber dana tidak ditemukan.", 403);
    }

    const recRes = await client.query<{
      id: string;
      full_name: string;
      phone_number: string;
    }>(
      `SELECT id, full_name, phone_number
       FROM users
       WHERE phone_number = $1 AND account_status = 'ACTIVE' AND role <> 'SYSTEM'`,
      [normalizedPhone]
    );
    if (recRes.rowCount === 0) {
      throw new DomainError("RECIPIENT_NOT_FOUND", "Penerima SakuKilat tidak ditemukan.", 404);
    }
    const recipient = recRes.rows[0];
    if (recipient.id === params.userId) {
      throw new DomainError(
        "SELF_TRANSFER_NOT_ALLOWED",
        "Tidak dapat mengirim transfer P2P ke nomor akun sendiri.",
        400
      );
    }

    const recWalletRes = await client.query<{ id: string }>(
      `SELECT id FROM wallets WHERE user_id = $1 AND wallet_type = 'MAIN'`,
      [recipient.id]
    );
    if (recWalletRes.rowCount === 0) {
      throw new DomainError("RECIPIENT_WALLET_MISSING", "Dompet penerima tidak ditemukan.", 500);
    }
    const recMainWalletId = recWalletRes.rows[0].id;

    const recLimit = await getUserBalanceLimitInfo(client, recipient.id);
    if (recLimit.currentTotalBalance + params.amount > recLimit.balanceLimit) {
      throw new DomainError(
        "RECIPIENT_LIMIT_EXCEEDED",
        "Saldo penerima akan melebihi batas maksimal akun penerima.",
        422
      );
    }

    const masked = maskRecipientName(recipient.full_name);

    const committed = await executeDoubleEntryInTx(client, {
      userId: params.userId,
      counterpartyUserId: recipient.id,
      idempotencyKey: params.idempotencyKey,
      transactionType: "TRANSFER_P2P",
      amount: params.amount,
      adminFee: 0,
      title: `Transfer ke ${masked}`,
      category: "Transfer P2P",
      sourceWalletId: params.sourceWalletId,
      destinationWalletId: recMainWalletId,
      metadata: {
        recipientPhone: recipient.phone_number,
        recipientMaskedName: masked,
        notes: params.notes || "",
        sourceWalletName: srcRes.rows[0].name,
      },
      legs: [
        {
          walletId: params.sourceWalletId,
          entryType: "DEBIT",
          amount: params.amount,
          description: `Transfer P2P ke ${masked}`,
        },
        {
          walletId: recMainWalletId,
          entryType: "CREDIT",
          amount: params.amount,
          description: `Terima Transfer P2P`,
        },
      ],
    });

    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES ($1, 'IN_APP', 'Transfer P2P Masuk', $2)`,
      [
        recipient.id,
        `Anda menerima transfer +Rp${params.amount.toLocaleString("id-ID")} bebas biaya admin.${params.notes ? ` Catatan: "${params.notes}"` : ""}`,
      ]
    );

    return committed;
  });
}

export async function executeBankTransfer(params: {
  userId: string;
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
  sourceWalletId: string;
  amount: number;
  notes?: string;
  txAuthToken: string;
  idempotencyKey: string;
}) {
  const authorized = await consumeTxAuthToken(params.txAuthToken, params.userId);
  if (!authorized) {
    throw new DomainError(
      "TX_AUTH_INVALID",
      "Token otorisasi PIN kedaluwarsa atau tidak valid.",
      401
    );
  }

  return withTransaction(async (client) => {
    const userRes = await client.query<{ kyc_status: string }>(
      `SELECT kyc_status FROM users WHERE id = $1`,
      [params.userId]
    );
    if (userRes.rowCount === 0 || userRes.rows[0].kyc_status !== "VERIFIED") {
      throw new DomainError(
        "KYC_REQUIRED",
        "Transfer antar-bank (BI-FAST) hanya tersedia untuk akun berstatus KYC VERIFIED.",
        403
      );
    }

    const srcRes = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM wallets WHERE id = $1 AND user_id = $2`,
      [params.sourceWalletId, params.userId]
    );
    if (srcRes.rowCount === 0) {
      throw new DomainError("WALLET_NOT_FOUND", "Dompet sumber dana tidak valid.", 403);
    }

    const quota = await getMonthlyBiFastUsage(client, params.userId);
    const isFreeQuota = quota.usedThisMonth < BIFAST_MONTHLY_FREE_QUOTA;
    const adminFee = isFreeQuota ? 0 : BIFAST_ADMIN_FEE;

    const escrowId = await getSystemWalletId(client, "SYSTEM_ESCROW");
    const feeId = await getSystemWalletId(client, "SYSTEM_FEE");

    const legs = [
      {
        walletId: params.sourceWalletId,
        entryType: "DEBIT" as const,
        amount: params.amount + adminFee,
        description: `Transfer BI-FAST ${params.bankCode} ${params.accountNumber}`,
      },
      {
        walletId: escrowId,
        entryType: "CREDIT" as const,
        amount: params.amount,
        description: `Outgoing BI-FAST settlement ke ${params.bankCode}`,
      },
    ];
    if (adminFee > 0) {
      legs.push({
        walletId: feeId,
        entryType: "CREDIT" as const,
        amount: adminFee,
        description: "Biaya admin BI-FAST (kuota gratis habis)",
      });
    }

    const committed = await executeDoubleEntryInTx(client, {
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      transactionType: "TRANSFER_BANK",
      amount: params.amount,
      adminFee,
      title: `Transfer Bank ${params.bankCode} - ${params.accountHolderName}`,
      category: "Transfer Bank",
      sourceWalletId: params.sourceWalletId,
      destinationWalletId: escrowId,
      metadata: {
        bankCode: params.bankCode,
        accountNumber: params.accountNumber,
        accountHolderName: params.accountHolderName,
        biFastFreeUsed: isFreeQuota,
        monthlySequence: quota.usedThisMonth + 1,
        notes: params.notes || "",
      },
      legs,
    });

    return {
      ...committed,
      biFastQuotaRemainingAfter: Math.max(0, BIFAST_MONTHLY_FREE_QUOTA - (quota.usedThisMonth + 1)),
    };
  });
}

export async function inquirePpob(params: {
  productCode: string;
  customerNumber: string;
}) {
  const product = PPOB_CATALOG.find((p) => p.code === params.productCode);
  if (!product) {
    throw new DomainError("PPOB_PRODUCT_NOT_FOUND", "Produk digital tidak ditemukan.", 404);
  }

  const maskedCustomer =
    product.category === "PULSA" || product.category === "DATA"
      ? normalizePhoneNumber(params.customerNumber)
      : `PELANGGAN ${params.customerNumber.slice(0, 4)}***`;

  return {
    product,
    customerNumber: params.customerNumber,
    customerName: maskedCustomer,
    period: "November 2026",
    basePrice: product.basePrice,
    adminFee: product.adminFee,
    totalPayable: product.basePrice + product.adminFee,
  };
}

export async function executePpob(params: {
  userId: string;
  productCode: string;
  customerNumber: string;
  sourceWalletId: string;
  txAuthToken: string;
  idempotencyKey: string;
}) {
  const authorized = await consumeTxAuthToken(params.txAuthToken, params.userId);
  if (!authorized) {
    throw new DomainError(
      "TX_AUTH_INVALID",
      "Token otorisasi PIN tidak valid atau kedaluwarsa.",
      401
    );
  }

  const product = PPOB_CATALOG.find((p) => p.code === params.productCode);
  if (!product) {
    throw new DomainError("PPOB_PRODUCT_NOT_FOUND", "Produk digital tidak ditemukan.", 404);
  }

  const tokenNumber =
    product.category === "PLN_TOKEN"
      ? Array.from({ length: 5 }, () => String(crypto.randomInt(1000, 9999))).join("-")
      : product.category === "GAME"
      ? `SKGAME-${crypto.randomBytes(4).toString("hex").toUpperCase()}`
      : null;

  return withTransaction(async (client) => {
    const srcRes = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM wallets WHERE id = $1 AND user_id = $2`,
      [params.sourceWalletId, params.userId]
    );
    if (srcRes.rowCount === 0) {
      throw new DomainError("WALLET_NOT_FOUND", "Dompet sumber dana tidak valid.", 403);
    }

    const ppobWalletId = await getSystemWalletId(client, "SYSTEM_PPOB");
    const feeWalletId = await getSystemWalletId(client, "SYSTEM_FEE");

    const committed = await executeDoubleEntryInTx(client, {
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      transactionType: "PPOB",
      amount: product.basePrice,
      adminFee: product.adminFee,
      title: product.name,
      category:
        product.category === "PLN_TOKEN" || product.category === "PLN_BILL"
          ? "Listrik PLN"
          : product.category === "GAME"
          ? "Voucher Game"
          : product.category === "BPJS"
          ? "BPJS Kesehatan"
          : product.category === "PDAM"
          ? "PDAM"
          : "Pulsa & Data",
      sourceWalletId: params.sourceWalletId,
      destinationWalletId: ppobWalletId,
      metadata: {
        productCode: product.code,
        provider: product.provider,
        customerNumber: params.customerNumber,
        tokenNumber,
        sourceWalletName: srcRes.rows[0].name,
      },
      legs: [
        {
          walletId: params.sourceWalletId,
          entryType: "DEBIT",
          amount: product.basePrice + product.adminFee,
          description: `Beli ${product.name}`,
        },
        {
          walletId: ppobWalletId,
          entryType: "CREDIT",
          amount: product.basePrice,
          description: `Settlement Biller ${product.provider}`,
        },
        {
          walletId: feeWalletId,
          entryType: "CREDIT",
          amount: product.adminFee,
          description: `Komisi PPOB ${product.code}`,
        },
      ],
    });

    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES ($1, 'IN_APP', 'Transaksi PPOB Berhasil', $2)`,
      [
        params.userId,
        `${product.name} untuk ${params.customerNumber} berhasil.${tokenNumber ? ` Kode/Token: ${tokenNumber}` : ""}`,
      ]
    );

    return committed;
  });
}

export async function listUserTransactions(params: {
  userId: string;
  direction?: "ALL" | "IN" | "OUT";
  type?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const pool = getPool();
  const limit = Math.min(100, Math.max(1, params.limit || 50));

  const res = await pool.query<{
    id: string;
    user_id: string;
    counterparty_user_id: string | null;
    reference_number: string;
    transaction_type: string;
    status: string;
    amount: string;
    admin_fee: string;
    total_amount: string;
    title: string;
    category: string;
    source_wallet_id: string | null;
    destination_wallet_id: string | null;
    metadata: Record<string, unknown>;
    created_at: Date;
    direction: "IN" | "OUT" | "INTERNAL";
  }>(
    `SELECT
       t.id,
       t.user_id,
       t.counterparty_user_id,
       t.reference_number,
       t.transaction_type,
       t.status,
       t.amount::text,
       t.admin_fee::text,
       t.total_amount::text,
       t.title,
       t.category,
       t.source_wallet_id,
       t.destination_wallet_id,
       t.metadata,
       t.created_at,
       CASE
         WHEN t.transaction_type = 'TOPUP' THEN 'IN'
         WHEN t.transaction_type = 'POCKET_MOVE' THEN 'INTERNAL'
         WHEN t.counterparty_user_id = $1 AND t.user_id <> $1 AND t.transaction_type IN ('TRANSFER_P2P', 'SPLIT_BILL') THEN 'IN'
         ELSE 'OUT'
       END AS direction
     FROM transactions t
     WHERE (t.user_id = $1 OR (t.counterparty_user_id = $1 AND t.transaction_type IN ('TRANSFER_P2P', 'SPLIT_BILL')))
       AND t.transaction_type <> 'GENESIS'
       AND ($2::text IS NULL OR t.transaction_type = $2)
       AND ($3::text IS NULL OR t.title ILIKE '%' || $3 || '%' OR t.reference_number ILIKE '%' || $3 || '%' OR t.category ILIKE '%' || $3 || '%')
       AND ($4::timestamptz IS NULL OR t.created_at >= $4)
       AND ($5::timestamptz IS NULL OR t.created_at <= $5)
     ORDER BY t.created_at DESC
     LIMIT $6`,
    [
      params.userId,
      params.type && params.type !== "ALL" ? params.type : null,
      params.search?.trim() || null,
      params.from ? new Date(params.from) : null,
      params.to ? new Date(params.to) : null,
      limit,
    ]
  );

  let rows = res.rows.map((r) => ({
    id: r.id,
    referenceNumber: r.reference_number,
    transactionType: r.transaction_type,
    status: r.status,
    amount: parseFloat(r.amount),
    adminFee: parseFloat(r.admin_fee),
    totalAmount: parseFloat(r.total_amount),
    title:
      r.direction === "IN" && r.transaction_type === "TRANSFER_P2P"
        ? "Terima Transfer SakuKilat"
        : r.direction === "IN" && r.transaction_type === "SPLIT_BILL"
        ? `Terima Patungan: ${r.title.replace(/^Bayar Patungan:\s*/i, "")}`
        : r.title,
    category: r.category,
    direction: r.direction,
    metadata: r.metadata,
    createdAt: r.created_at.toISOString(),
  }));

  if (params.direction === "IN" || params.direction === "OUT") {
    rows = rows.filter((r) => r.direction === params.direction);
  }

  return rows;
}

export async function getTransactionDetail(userId: string, transactionId: string) {
  const pool = getPool();
  const txRes = await pool.query<{
    id: string;
    user_id: string;
    counterparty_user_id: string | null;
    reference_number: string;
    transaction_type: string;
    status: string;
    amount: string;
    admin_fee: string;
    total_amount: string;
    title: string;
    category: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id, user_id, counterparty_user_id, reference_number, transaction_type, status,
            amount::text, admin_fee::text, total_amount::text, title, category, metadata, created_at
     FROM transactions
     WHERE id = $1 AND (user_id = $2 OR counterparty_user_id = $2)`,
    [transactionId, userId]
  );
  if (txRes.rowCount === 0) {
    throw new DomainError("TRANSACTION_NOT_FOUND", "Transaksi tidak ditemukan.", 404);
  }
  const t = txRes.rows[0];
  const entriesRes = await pool.query<{
    id: string;
    wallet_name: string;
    entry_type: string;
    amount: string;
    balance_before: string;
    balance_after: string;
    description: string;
  }>(
    `SELECT l.id::text, w.name AS wallet_name, l.entry_type, l.amount::text,
            l.balance_before::text, l.balance_after::text, l.description
     FROM ledger_entries l
     JOIN wallets w ON w.id = l.wallet_id
     WHERE l.transaction_id = $1
     ORDER BY l.id ASC`,
    [t.id]
  );

  return {
    id: t.id,
    referenceNumber: t.reference_number,
    transactionType: t.transaction_type,
    status: t.status,
    amount: parseFloat(t.amount),
    adminFee: parseFloat(t.admin_fee),
    totalAmount: parseFloat(t.total_amount),
    title: t.title,
    category: t.category,
    metadata: t.metadata,
    createdAt: t.created_at.toISOString(),
    ledgerEntries: entriesRes.rows.map((e) => ({
      id: e.id,
      walletName: e.wallet_name,
      entryType: e.entry_type,
      amount: parseFloat(e.amount),
      balanceBefore: parseFloat(e.balance_before),
      balanceAfter: parseFloat(e.balance_after),
      description: e.description,
    })),
  };
}

export async function getMonthlyAnalytics(userId: string) {
  const rows = await listUserTransactions({ userId, limit: 100 });
  const successRows = rows.filter((r) => r.status === "SUCCESS");

  const totalIn = successRows
    .filter((r) => r.direction === "IN")
    .reduce((sum, r) => sum + r.amount, 0);
  const totalOut = successRows
    .filter((r) => r.direction === "OUT")
    .reduce((sum, r) => sum + r.totalAmount, 0);

  const categoryTotals = new Map<string, number>();
  for (const r of successRows.filter((x) => x.direction === "OUT")) {
    categoryTotals.set(r.category, (categoryTotals.get(r.category) || 0) + r.totalAmount);
  }

  const categories = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      sharePercent: totalOut > 0 ? Math.round((amount / totalOut) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Build 7-day daily series ending today
  const dailySeries: Array<{ label: string; dateIso: string; outAmount: number; inAmount: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const iso = dt.toISOString().slice(0, 10);
    const dayLabel = dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
    dailySeries.push({ label: dayLabel, dateIso: iso, outAmount: 0, inAmount: 0 });
  }

  for (const r of successRows) {
    const iso = r.createdAt.slice(0, 10);
    const bucket = dailySeries.find((d) => d.dateIso === iso);
    if (bucket) {
      if (r.direction === "IN") bucket.inAmount += r.amount;
      if (r.direction === "OUT") bucket.outAmount += r.totalAmount;
    }
  }

  return {
    totalIn,
    totalOut,
    netFlow: totalIn - totalOut,
    transactionCount: successRows.length,
    categories,
    dailySeries,
  };
}

