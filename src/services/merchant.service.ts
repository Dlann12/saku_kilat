import { getPool, withTransaction } from "@/db/pool";
import {
  DomainError,
  executeDoubleEntryInTx,
  getSystemWalletId,
} from "@/lib/ledger";
import { consumeTxAuthToken } from "@/lib/auth";
import { buildQrisPayload } from "@/lib/qris";

export const MERCHANT_SETTLEMENT_FEE = 2_500;

export async function getMerchantDashboard(userId: string) {
  const pool = getPool();
  const merchantsRes = await pool.query<{
    id: string;
    nmid: string;
    merchant_name: string;
    merchant_city: string;
    category: string;
    category_scale: string;
    mdr_bps: number;
    settlement_wallet_id: string;
    balance: string;
  }>(
    `SELECT m.id, m.nmid, m.merchant_name, m.merchant_city, m.category, m.category_scale,
            m.mdr_bps, m.settlement_wallet_id, w.balance::text
     FROM merchants m
     JOIN wallets w ON w.id = m.settlement_wallet_id
     WHERE m.owner_user_id = $1
     ORDER BY m.created_at ASC`,
    [userId]
  );

  // Fallback: if non-Pak Budi user opens /merchant, show public demo UMKM overview read-only or allow testing Pak Budi's warung
  const targetMerchants =
    merchantsRes.rowCount && merchantsRes.rowCount > 0
      ? merchantsRes.rows
      : (
          await pool.query<{
            id: string;
            nmid: string;
            merchant_name: string;
            merchant_city: string;
            category: string;
            category_scale: string;
            mdr_bps: number;
            settlement_wallet_id: string;
            balance: string;
          }>(
            `SELECT m.id, m.nmid, m.merchant_name, m.merchant_city, m.category, m.category_scale,
                    m.mdr_bps, m.settlement_wallet_id, w.balance::text
             FROM merchants m
             JOIN wallets w ON w.id = m.settlement_wallet_id
             ORDER BY m.created_at ASC`
          )
        ).rows;

  const walletIds = targetMerchants.map((m) => m.settlement_wallet_id);
  const incomingRes =
    walletIds.length > 0
      ? await pool.query<{
          id: string;
          reference_number: string;
          title: string;
          amount: string;
          status: string;
          metadata: Record<string, unknown>;
          created_at: Date;
        }>(
          `SELECT id, reference_number, title, amount::text, status, metadata, created_at
           FROM transactions
           WHERE destination_wallet_id = ANY($1::uuid[])
             AND transaction_type = 'QRIS'
           ORDER BY created_at DESC
           LIMIT 25`,
          [walletIds]
        )
      : { rows: [] };

  const settlementsRes =
    walletIds.length > 0
      ? await pool.query<{
          id: string;
          reference_number: string;
          title: string;
          amount: string;
          admin_fee: string;
          status: string;
          created_at: Date;
        }>(
          `SELECT id, reference_number, title, amount::text, admin_fee::text, status, created_at
           FROM transactions
           WHERE source_wallet_id = ANY($1::uuid[])
             AND transaction_type = 'MERCHANT_SETTLE'
           ORDER BY created_at DESC
           LIMIT 15`,
          [walletIds]
        )
      : { rows: [] };

  const merchants = targetMerchants.map((m) => ({
    id: m.id,
    nmid: m.nmid,
    merchantName: m.merchant_name,
    merchantCity: m.merchant_city,
    category: m.category,
    categoryScale: m.category_scale,
    mdrBps: m.mdr_bps,
    settlementWalletId: m.settlement_wallet_id,
    balance: parseFloat(m.balance),
    staticQrisPayload: buildQrisPayload({
      nmid: m.nmid,
      merchantName: m.merchant_name,
      merchantCity: m.merchant_city,
      isDynamic: false,
    }),
  }));

  const isOwner = Boolean(merchantsRes.rowCount && merchantsRes.rowCount > 0);
  const totalSettlementBalance = merchants.reduce((acc, m) => acc + m.balance, 0);
  const totalQrisGross = incomingRes.rows
    .filter((r) => r.status === "SUCCESS")
    .reduce((acc, r) => acc + parseFloat(r.amount), 0);

  return {
    isOwner,
    totalSettlementBalance,
    totalQrisGross,
    merchants,
    incomingQris: incomingRes.rows.map((r) => ({
      id: r.id,
      referenceNumber: r.reference_number,
      title: r.title,
      amount: parseFloat(r.amount),
      status: r.status,
      mdrFee: Number(r.metadata?.mdrFee || 0),
      createdAt: r.created_at.toISOString(),
    })),
    settlements: settlementsRes.rows.map((s) => ({
      id: s.id,
      referenceNumber: s.reference_number,
      title: s.title,
      amount: parseFloat(s.amount),
      adminFee: parseFloat(s.admin_fee),
      status: s.status,
      createdAt: s.created_at.toISOString(),
    })),
  };
}

export async function settleMerchantBalance(params: {
  userId: string;
  merchantId: string;
  amount: number;
  destinationBank: string;
  accountNumber: string;
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

  if (params.amount <= MERCHANT_SETTLEMENT_FEE) {
    throw new DomainError(
      "AMOUNT_TOO_SMALL",
      `Minimal pencairan instan harus lebih besar dari biaya settlement Rp${MERCHANT_SETTLEMENT_FEE.toLocaleString("id-ID")}.`,
      422
    );
  }

  return withTransaction(async (client) => {
    const mRes = await client.query<{
      id: string;
      owner_user_id: string;
      merchant_name: string;
      settlement_wallet_id: string;
    }>(
      `SELECT id, owner_user_id, merchant_name, settlement_wallet_id
       FROM merchants WHERE id = $1`,
      [params.merchantId]
    );
    if (mRes.rowCount === 0) {
      throw new DomainError("MERCHANT_NOT_FOUND", "Merchant tidak ditemukan.", 404);
    }
    const merchant = mRes.rows[0];
    if (merchant.owner_user_id !== params.userId) {
      throw new DomainError(
        "FORBIDDEN",
        "Hanya pemilik merchant yang dapat mencairkan dana settlement.",
        403
      );
    }

    const escrowId = await getSystemWalletId(client, "SYSTEM_ESCROW");
    const feeId = await getSystemWalletId(client, "SYSTEM_FEE");
    const netDisbursed = params.amount - MERCHANT_SETTLEMENT_FEE;

    return executeDoubleEntryInTx(client, {
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      transactionType: "MERCHANT_SETTLE",
      amount: netDisbursed,
      adminFee: MERCHANT_SETTLEMENT_FEE,
      title: `Pencairan Instan ${merchant.merchant_name} -> ${params.destinationBank}`,
      category: "Settlement UMKM",
      sourceWalletId: merchant.settlement_wallet_id,
      destinationWalletId: escrowId,
      metadata: {
        merchantId: merchant.id,
        destinationBank: params.destinationBank,
        accountNumber: params.accountNumber,
        grossDebited: params.amount,
      },
      legs: [
        {
          walletId: merchant.settlement_wallet_id,
          entryType: "DEBIT",
          amount: params.amount,
          description: `Pencairan instan merchant ke ${params.destinationBank}`,
        },
        {
          walletId: escrowId,
          entryType: "CREDIT",
          amount: netDisbursed,
          description: `Payout bank merchant ${params.accountNumber}`,
        },
        {
          walletId: feeId,
          entryType: "CREDIT",
          amount: MERCHANT_SETTLEMENT_FEE,
          description: "Biaya pencairan instan SakuKilat Bisnis",
        },
      ],
    });
  });
}

export async function getAdminOverview() {
  const pool = getPool();

  const [ledgerCheck, escrowRes, kycRes, outboxRes, recentEntriesRes, recentTxRes] =
    await Promise.all([
      pool.query<{ total_debit: string; total_credit: string; total_entries: string }>(`
        SELECT
          COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0)::text AS total_debit,
          COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0)::text AS total_credit,
          COUNT(*)::text AS total_entries
        FROM ledger_entries
      `),
      pool.query<{ wallet_type: string; name: string; balance: string }>(`
        SELECT wallet_type, name, balance::text
        FROM wallets
        WHERE wallet_type IN ('SYSTEM_ESCROW', 'SYSTEM_FEE', 'SYSTEM_PPOB', 'SYSTEM_GENESIS')
        ORDER BY wallet_type
      `),
      pool.query<{
        id: string;
        user_id: string;
        phone_number: string;
        full_name_ktp: string;
        status: string;
        liveness_score: string;
        rejection_reason: string | null;
        created_at: Date;
      }>(`
        SELECT k.id, k.user_id, u.phone_number, k.full_name_ktp, k.status,
               k.liveness_score::text, k.rejection_reason, k.created_at
        FROM kyc_documents k
        JOIN users u ON u.id = k.user_id
        ORDER BY CASE k.status WHEN 'PENDING' THEN 0 ELSE 1 END, k.created_at DESC
        LIMIT 20
      `),
      pool.query<{
        id: string;
        topic: string;
        aggregate_type: string;
        aggregate_id: string;
        payload: Record<string, unknown>;
        status: string;
        created_at: Date;
      }>(`
        SELECT id::text, topic, aggregate_type, aggregate_id, payload, status, created_at
        FROM outbox_events
        ORDER BY id DESC
        LIMIT 20
      `),
      pool.query<{
        id: string;
        reference_number: string;
        wallet_name: string;
        entry_type: string;
        amount: string;
        balance_before: string;
        balance_after: string;
        description: string;
        created_at: Date;
      }>(`
        SELECT l.id::text, t.reference_number, w.name AS wallet_name, l.entry_type,
               l.amount::text, l.balance_before::text, l.balance_after::text,
               l.description, l.created_at
        FROM ledger_entries l
        JOIN transactions t ON t.id = l.transaction_id
        JOIN wallets w ON w.id = l.wallet_id
        ORDER BY l.id DESC
        LIMIT 25
      `),
      pool.query<{
        id: string;
        reference_number: string;
        transaction_type: string;
        status: string;
        amount: string;
        admin_fee: string;
        title: string;
        user_name: string;
        created_at: Date;
      }>(`
        SELECT t.id, t.reference_number, t.transaction_type, t.status,
               t.amount::text, t.admin_fee::text, t.title, u.full_name AS user_name, t.created_at
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        WHERE t.transaction_type <> 'GENESIS'
        ORDER BY t.created_at DESC
        LIMIT 20
      `),
    ]);

  const totalDebit = parseFloat(ledgerCheck.rows[0].total_debit);
  const totalCredit = parseFloat(ledgerCheck.rows[0].total_credit);

  return {
    ledgerInvariant: {
      balanced: totalDebit === totalCredit,
      totalDebit,
      totalCredit,
      discrepancy: Math.abs(totalDebit - totalCredit),
      totalEntries: parseInt(ledgerCheck.rows[0].total_entries, 10),
    },
    systemWallets: escrowRes.rows.map((w) => ({
      walletType: w.wallet_type,
      name: w.name,
      balance: parseFloat(w.balance),
    })),
    kycQueue: kycRes.rows.map((k) => ({
      id: k.id,
      userId: k.user_id,
      phoneNumber: k.phone_number,
      fullNameKtp: k.full_name_ktp,
      status: k.status,
      livenessScore: parseFloat(k.liveness_score),
      rejectionReason: k.rejection_reason,
      createdAt: k.created_at.toISOString(),
    })),
    outboxEvents: outboxRes.rows.map((e) => ({
      id: e.id,
      topic: e.topic,
      aggregateType: e.aggregate_type,
      aggregateId: e.aggregate_id,
      payload: e.payload,
      status: e.status,
      createdAt: e.created_at.toISOString(),
    })),
    recentLedgerEntries: recentEntriesRes.rows.map((l) => ({
      id: l.id,
      referenceNumber: l.reference_number,
      walletName: l.wallet_name,
      entryType: l.entry_type,
      amount: parseFloat(l.amount),
      balanceBefore: parseFloat(l.balance_before),
      balanceAfter: parseFloat(l.balance_after),
      description: l.description,
      createdAt: l.created_at.toISOString(),
    })),
    recentTransactions: recentTxRes.rows.map((t) => ({
      id: t.id,
      referenceNumber: t.reference_number,
      transactionType: t.transaction_type,
      status: t.status,
      amount: parseFloat(t.amount),
      adminFee: parseFloat(t.admin_fee),
      title: t.title,
      userName: t.user_name,
      createdAt: t.created_at.toISOString(),
    })),
  };
}

export async function reverseTransaction(params: {
  transactionId: string;
  reason: string;
}) {
  return withTransaction(async (client) => {
    const txRes = await client.query<{
      id: string;
      user_id: string;
      counterparty_user_id: string | null;
      reference_number: string;
      transaction_type: string;
      status: string;
      amount: string;
      admin_fee: string;
      title: string;
      source_wallet_id: string | null;
      destination_wallet_id: string | null;
    }>(
      `SELECT id, user_id, counterparty_user_id, reference_number, transaction_type, status,
              amount::text, admin_fee::text, title, source_wallet_id, destination_wallet_id
       FROM transactions WHERE id = $1 FOR UPDATE`,
      [params.transactionId]
    );
    if (txRes.rowCount === 0) {
      throw new DomainError("TRANSACTION_NOT_FOUND", "Transaksi tidak ditemukan.", 404);
    }
    const orig = txRes.rows[0];
    if (orig.status === "REVERSED") {
      throw new DomainError("ALREADY_REVERSED", "Transaksi ini sudah di-reverse sebelumnya.", 409);
    }
    if (orig.status !== "SUCCESS" || orig.transaction_type === "GENESIS") {
      throw new DomainError(
        "REVERSAL_NOT_ALLOWED",
        "Hanya transaksi berstatus SUCCESS non-genesis yang dapat dilakukan auto-reversal.",
        422
      );
    }

    const legsRes = await client.query<{
      wallet_id: string;
      entry_type: "DEBIT" | "CREDIT";
      amount: string;
    }>(
      `SELECT wallet_id, entry_type, amount::text FROM ledger_entries WHERE transaction_id = $1 ORDER BY id ASC`,
      [orig.id]
    );

    const reversalLegs = legsRes.rows.map((l) => ({
      walletId: l.wallet_id,
      entryType: (l.entry_type === "DEBIT" ? "CREDIT" : "DEBIT") as "DEBIT" | "CREDIT",
      amount: parseFloat(l.amount),
      description: `Auto-Reversal ${orig.reference_number}: ${params.reason}`,
      allowLockedWallet: true,
    }));

    const reversalTx = await executeDoubleEntryInTx(client, {
      userId: orig.user_id,
      counterpartyUserId: orig.counterparty_user_id,
      idempotencyKey: `reversal-${orig.id}`,
      transactionType: orig.transaction_type as
        | "TOPUP"
        | "TRANSFER_P2P"
        | "TRANSFER_BANK"
        | "QRIS"
        | "PPOB"
        | "POCKET_MOVE"
        | "SPLIT_BILL"
        | "MERCHANT_SETTLE",
      amount: parseFloat(orig.amount),
      adminFee: parseFloat(orig.admin_fee),
      title: `Reversal: ${orig.title}`,
      category: "Auto-Reversal",
      sourceWalletId: orig.destination_wallet_id,
      destinationWalletId: orig.source_wallet_id,
      metadata: {
        reversedTransactionId: orig.id,
        reversedReference: orig.reference_number,
        reason: params.reason,
      },
      legs: reversalLegs,
      outboxTopic: "ledger.transaction.reversed",
    });

    await client.query(
      `UPDATE transactions SET status = 'REVERSED', updated_at = NOW() WHERE id = $1`,
      [orig.id]
    );

    await client.query(
      `INSERT INTO notifications (user_id, channel, title, body)
       VALUES ($1, 'IN_APP', 'Pengembalian Dana Otomatis (Reversal)', $2)`,
      [
        orig.user_id,
        `Dana transaksi ${orig.reference_number} (${orig.title}) telah dikembalikan otomatis.`,
      ]
    );

    return { originalId: orig.id, reversalTransaction: reversalTx };
  });
}

