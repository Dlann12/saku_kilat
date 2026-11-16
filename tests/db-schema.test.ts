import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, closePool } from "@/db/pool";
import { seedDatabase } from "@/db/seed";

describe("Database Schema & Double-Entry Ledger Invariants", () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  it("maintains exact global DEBIT == CREDIT balance across all ledger_entries", async () => {
    const res = await getPool().query<{
      total_debit: string;
      total_credit: string;
    }>(`
      SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0)::text AS total_debit,
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0)::text AS total_credit
      FROM ledger_entries
    `);
    const debit = parseFloat(res.rows[0].total_debit);
    const credit = parseFloat(res.rows[0].total_credit);
    expect(debit).toBeGreaterThan(0);
    expect(debit).toBe(credit);
  });

  it("reconciles every wallet balance against ledger_entries net movements", async () => {
    const res = await getPool().query<{
      id: string;
      wallet_type: string;
      balance: string;
      net_ledger: string;
    }>(`
      SELECT
        w.id,
        w.wallet_type,
        w.balance::text,
        (
          CASE WHEN w.wallet_type = 'SYSTEM_GENESIS' THEN 50000000000.00 ELSE 0.00 END
          + COALESCE(SUM(CASE WHEN l.entry_type = 'CREDIT' THEN l.amount ELSE -l.amount END), 0)
        )::text AS net_ledger
      FROM wallets w
      LEFT JOIN ledger_entries l ON l.wallet_id = w.id
      GROUP BY w.id, w.wallet_type, w.balance
    `);

    for (const row of res.rows) {
      expect(parseFloat(row.balance)).toBe(parseFloat(row.net_ledger));
    }
  });

  it("enforces append-only ledger_entries via PostgreSQL trigger (blocks UPDATE and DELETE)", async () => {
    const pool = getPool();
    const first = await pool.query<{ id: string }>(
      `SELECT id FROM ledger_entries LIMIT 1`
    );
    const entryId = first.rows[0].id;

    await expect(
      pool.query(`UPDATE ledger_entries SET amount = 999 WHERE id = $1`, [entryId])
    ).rejects.toThrow(/append-only/i);

    await expect(
      pool.query(`DELETE FROM ledger_entries WHERE id = $1`, [entryId])
    ).rejects.toThrow(/append-only/i);
  });

  it("enforces CHECK (balance >= 0) constraint at PostgreSQL level", async () => {
    await expect(
      getPool().query(
        `UPDATE wallets SET balance = -1.00 WHERE id = '21000000-0000-4000-8000-000000000001'`
      )
    ).rejects.toThrow();
  });
});

