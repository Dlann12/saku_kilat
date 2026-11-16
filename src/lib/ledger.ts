import type { PoolClient } from "pg";
import { withTransaction } from "@/db/pool";
import { generateReferenceNumber } from "@/lib/crypto";

export type TransactionType =
  | "GENESIS"
  | "TOPUP"
  | "TRANSFER_P2P"
  | "TRANSFER_BANK"
  | "QRIS"
  | "PPOB"
  | "POCKET_MOVE"
  | "SPLIT_BILL"
  | "MERCHANT_SETTLE";

export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED" | "REVERSED";

export interface LedgerLegInput {
  walletId: string;
  entryType: "DEBIT" | "CREDIT";
  amount: number;
  description: string;
  allowLockedWallet?: boolean;
}

export interface ExecuteTransactionInput {
  userId: string;
  counterpartyUserId?: string | null;
  idempotencyKey: string;
  referenceNumber?: string;
  transactionType: TransactionType;
  status?: TransactionStatus;
  amount: number;
  adminFee?: number;
  title: string;
  category: string;
  sourceWalletId?: string | null;
  destinationWalletId?: string | null;
  metadata?: Record<string, unknown>;
  legs: LedgerLegInput[];
  outboxTopic?: string;
  createdAt?: Date;
}

export interface CommittedTransaction {
  id: string;
  referenceNumber: string;
  transactionType: TransactionType;
  status: TransactionStatus;
  amount: number;
  adminFee: number;
  totalAmount: number;
  title: string;
  category: string;
  sourceWalletId: string | null;
  destinationWalletId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "DomainError";
  }
}

interface LockedWalletRow {
  id: string;
  user_id: string;
  wallet_type: string;
  name: string;
  balance: string;
  is_locked: boolean;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function validateBalancedLegs(legs: LedgerLegInput[]): void {
  if (!Array.isArray(legs) || legs.length < 2) {
    throw new DomainError(
      "LEDGER_MIN_LEGS",
      "Double-entry transaction requires at least 2 ledger legs",
      400
    );
  }
  let debitCents = 0;
  let creditCents = 0;
  for (const leg of legs) {
    if (!Number.isFinite(leg.amount) || leg.amount <= 0) {
      throw new DomainError(
        "INVALID_LEG_AMOUNT",
        "Every ledger entry must have a positive amount",
        400
      );
    }
    const cents = toCents(leg.amount);
    if (leg.entryType === "DEBIT") {
      debitCents += cents;
    } else {
      creditCents += cents;
    }
  }
  if (debitCents !== creditCents) {
    throw new DomainError(
      "LEDGER_IMBALANCE",
      `Double-entry violation: DEBIT (${fromCents(debitCents)}) != CREDIT (${fromCents(creditCents)})`,
      500
    );
  }
}

export async function executeDoubleEntryInTx(
  client: PoolClient,
  input: ExecuteTransactionInput
): Promise<CommittedTransaction> {
  validateBalancedLegs(input.legs);

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new DomainError("INVALID_AMOUNT", "Nominal transaksi harus lebih dari Rp0", 400);
  }

  const adminFee = input.adminFee ?? 0;
  if (!Number.isFinite(adminFee) || adminFee < 0) {
    throw new DomainError("INVALID_FEE", "Biaya admin tidak valid", 400);
  }

  const uniqueWalletIds = Array.from(new Set(input.legs.map((l) => l.walletId))).sort();
  const walletResult = await client.query<LockedWalletRow>(
    `SELECT id, user_id, wallet_type, name, balance::text, is_locked
     FROM wallets
     WHERE id = ANY($1::uuid[])
     ORDER BY id ASC
     FOR UPDATE`,
    [uniqueWalletIds]
  );

  const walletMap = new Map<string, { row: LockedWalletRow; balanceCents: number }>();
  for (const row of walletResult.rows) {
    walletMap.set(row.id, {
      row,
      balanceCents: toCents(parseFloat(row.balance)),
    });
  }

  for (const walletId of uniqueWalletIds) {
    if (!walletMap.has(walletId)) {
      throw new DomainError("WALLET_NOT_FOUND", `Dompet ${walletId} tidak ditemukan`, 404);
    }
  }

  const entrySnapshots: Array<{
    leg: LedgerLegInput;
    before: number;
    after: number;
  }> = [];

  for (const leg of input.legs) {
    const state = walletMap.get(leg.walletId)!;
    if (leg.entryType === "DEBIT" && state.row.is_locked && !leg.allowLockedWallet) {
      throw new DomainError(
        "WALLET_LOCKED",
        `Kantong "${state.row.name}" sedang dikunci. Buka kunci terlebih dahulu untuk bertransaksi.`,
        422
      );
    }
    const legCents = toCents(leg.amount);
    const beforeCents = state.balanceCents;
    const afterCents =
      leg.entryType === "DEBIT" ? beforeCents - legCents : beforeCents + legCents;

    if (afterCents < 0) {
      throw new DomainError(
        "INSUFFICIENT_BALANCE",
        `Saldo pada "${state.row.name}" tidak mencukupi.`,
        422
      );
    }
    state.balanceCents = afterCents;
    entrySnapshots.push({
      leg,
      before: fromCents(beforeCents),
      after: fromCents(afterCents),
    });
  }

  const referenceNumber = input.referenceNumber || generateReferenceNumber("SK");
  const status = input.status ?? "SUCCESS";
  const createdAt = input.createdAt ?? new Date();

  const txInsert = await client.query<{
    id: string;
    reference_number: string;
    transaction_type: TransactionType;
    status: TransactionStatus;
    amount: string;
    admin_fee: string;
    total_amount: string;
    title: string;
    category: string;
    source_wallet_id: string | null;
    destination_wallet_id: string | null;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `INSERT INTO transactions (
       user_id, counterparty_user_id, idempotency_key, reference_number,
       transaction_type, status, amount, admin_fee, title, category,
       source_wallet_id, destination_wallet_id, metadata, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
     RETURNING id, reference_number, transaction_type, status, amount::text,
               admin_fee::text, total_amount::text, title, category,
               source_wallet_id, destination_wallet_id, metadata, created_at`,
    [
      input.userId,
      input.counterpartyUserId ?? null,
      input.idempotencyKey,
      referenceNumber,
      input.transactionType,
      status,
      input.amount.toFixed(2),
      adminFee.toFixed(2),
      input.title,
      input.category,
      input.sourceWalletId ?? null,
      input.destinationWalletId ?? null,
      JSON.stringify(input.metadata ?? {}),
      createdAt,
    ]
  );

  const txRow = txInsert.rows[0];

  for (const [walletId, state] of walletMap.entries()) {
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
      [fromCents(state.balanceCents).toFixed(2), walletId]
    );
  }

  for (const snap of entrySnapshots) {
    await client.query(
      `INSERT INTO ledger_entries (
         transaction_id, wallet_id, entry_type, amount, balance_before, balance_after, description, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        txRow.id,
        snap.leg.walletId,
        snap.leg.entryType,
        snap.leg.amount.toFixed(2),
        snap.before.toFixed(2),
        snap.after.toFixed(2),
        snap.leg.description,
        createdAt,
      ]
    );
  }

  await client.query(
    `INSERT INTO outbox_events (topic, aggregate_type, aggregate_id, payload, status, created_at)
     VALUES ($1, 'TRANSACTION', $2, $3, 'PUBLISHED', $4)`,
    [
      input.outboxTopic ?? `ledger.${input.transactionType.toLowerCase()}.committed`,
      txRow.id,
      JSON.stringify({
        transactionId: txRow.id,
        referenceNumber: txRow.reference_number,
        type: txRow.transaction_type,
        amount: parseFloat(txRow.amount),
        adminFee: parseFloat(txRow.admin_fee),
        userId: input.userId,
      }),
      createdAt,
    ]
  );

  return {
    id: txRow.id,
    referenceNumber: txRow.reference_number,
    transactionType: txRow.transaction_type,
    status: txRow.status,
    amount: parseFloat(txRow.amount),
    adminFee: parseFloat(txRow.admin_fee),
    totalAmount: parseFloat(txRow.total_amount),
    title: txRow.title,
    category: txRow.category,
    sourceWalletId: txRow.source_wallet_id,
    destinationWalletId: txRow.destination_wallet_id,
    metadata: txRow.metadata,
    createdAt: txRow.created_at.toISOString(),
  };
}

export async function executeDoubleEntryTransaction(
  input: ExecuteTransactionInput
): Promise<CommittedTransaction> {
  return withTransaction((client) => executeDoubleEntryInTx(client, input));
}

export async function getSystemWalletId(
  client: PoolClient,
  walletType: "SYSTEM_ESCROW" | "SYSTEM_FEE" | "SYSTEM_PPOB" | "SYSTEM_GENESIS"
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM wallets WHERE wallet_type = $1 LIMIT 1`,
    [walletType]
  );
  if (res.rowCount === 0) {
    throw new DomainError(
      "SYSTEM_WALLET_MISSING",
      `System wallet ${walletType} belum tersedia. Jalankan seed database.`,
      500
    );
  }
  return res.rows[0].id;
}

