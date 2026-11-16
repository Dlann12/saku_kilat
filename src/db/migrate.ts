import fs from "node:fs";
import path from "node:path";
import { getPool, closePool } from "./pool";

export async function runMigrations(reset = false): Promise<void> {
  const pool = getPool();
  if (reset) {
    await pool.query(`
      DROP TABLE IF EXISTS notifications CASCADE;
      DROP TABLE IF EXISTS outbox_events CASCADE;
      DROP TABLE IF EXISTS split_bill_participants CASCADE;
      DROP TABLE IF EXISTS split_bills CASCADE;
      DROP TABLE IF EXISTS topup_orders CASCADE;
      DROP TABLE IF EXISTS idempotency_keys CASCADE;
      DROP TABLE IF EXISTS ledger_entries CASCADE;
      DROP TABLE IF EXISTS transactions CASCADE;
      DROP TABLE IF EXISTS merchants CASCADE;
      DROP TABLE IF EXISTS wallets CASCADE;
      DROP TABLE IF EXISTS kyc_documents CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);
  }

  const schemaPath = path.resolve(process.cwd(), "src/db/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
}

if (require.main === module) {
  const shouldReset = process.argv.includes("--reset");
  runMigrations(shouldReset)
    .then(() => {
      console.log("SakuKilat schema migrated successfully.");
      return closePool();
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

