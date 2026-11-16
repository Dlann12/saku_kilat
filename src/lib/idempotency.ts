import { getPool } from "@/db/pool";
import { hashPayload } from "@/lib/crypto";
import { DomainError } from "@/lib/ledger";

export interface IdempotentResult<T> {
  replayed: boolean;
  status: number;
  body: T;
}

export async function runWithIdempotency<T>(params: {
  idempotencyKey: string | null;
  userId: string;
  endpoint: string;
  payload: unknown;
  execute: () => Promise<{ status: number; body: T }>;
}): Promise<IdempotentResult<T>> {
  const key = params.idempotencyKey?.trim();
  if (!key) {
    throw new DomainError(
      "MISSING_IDEMPOTENCY_KEY",
      "Header X-Idempotency-Key wajib disertakan untuk mencegah pemotongan saldo ganda.",
      400
    );
  }
  if (key.length < 8 || key.length > 128) {
    throw new DomainError(
      "INVALID_IDEMPOTENCY_KEY",
      "Panjang X-Idempotency-Key harus 8–128 karakter.",
      400
    );
  }

  const reqHash = hashPayload(params.payload);
  const pool = getPool();

  const existing = await pool.query<{
    user_id: string;
    endpoint: string;
    request_hash: string;
    response_status: number;
    response_body: T;
  }>(
    `SELECT user_id, endpoint, request_hash, response_status, response_body
     FROM idempotency_keys
     WHERE key = $1`,
    [key]
  );

  if (existing.rowCount && existing.rows[0]) {
    const row = existing.rows[0];
    if (
      row.user_id !== params.userId ||
      row.endpoint !== params.endpoint ||
      row.request_hash !== reqHash
    ) {
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        "X-Idempotency-Key sudah digunakan untuk payload atau endpoint berbeda.",
        409
      );
    }
    return {
      replayed: true,
      status: row.response_status,
      body: row.response_body,
    };
  }

  const fresh = await params.execute();

  await pool.query(
    `INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key) DO NOTHING`,
    [
      key,
      params.userId,
      params.endpoint,
      reqHash,
      fresh.status,
      JSON.stringify(fresh.body),
    ]
  );

  return {
    replayed: false,
    status: fresh.status,
    body: fresh.body,
  };
}

