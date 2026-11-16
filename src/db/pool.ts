import { Pool, type PoolClient } from "pg";

declare global {
  var __sakukilatPgPool: Pool | undefined;
}

const DEFAULT_DATABASE_URL =
  "postgresql://sakukilat:sakukilat_dev_password@127.0.0.1:54330/sakukilat";

export function getPool(): Pool {
  if (!globalThis.__sakukilatPgPool) {
    globalThis.__sakukilatPgPool = new Pool({
      connectionString: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globalThis.__sakukilatPgPool;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (globalThis.__sakukilatPgPool) {
    await globalThis.__sakukilatPgPool.end();
    globalThis.__sakukilatPgPool = undefined;
  }
}

