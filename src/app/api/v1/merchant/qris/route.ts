import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { merchantQrisSchema } from "@/lib/validators";
import { getPool } from "@/db/pool";
import { buildQrisPayload } from "@/lib/qris";
import { DomainError } from "@/lib/ledger";

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const parsed = merchantQrisSchema.parse(body);

    const res = await getPool().query<{
      nmid: string;
      merchant_name: string;
      merchant_city: string;
    }>(`SELECT nmid, merchant_name, merchant_city FROM merchants WHERE id = $1`, [
      parsed.merchant_id,
    ]);
    if (res.rowCount === 0) {
      throw new DomainError("MERCHANT_NOT_FOUND", "Merchant tidak ditemukan.", 404);
    }

    const m = res.rows[0];
    const payload = buildQrisPayload({
      nmid: m.nmid,
      merchantName: m.merchant_name,
      merchantCity: m.merchant_city,
      amount: parsed.amount ?? undefined,
      isDynamic: parsed.is_dynamic && Boolean(parsed.amount && parsed.amount > 0),
    });

    return ok({
      nmid: m.nmid,
      merchantName: m.merchant_name,
      merchantCity: m.merchant_city,
      isDynamic: parsed.is_dynamic && Boolean(parsed.amount && parsed.amount > 0),
      amount: parsed.amount || null,
      rawQrPayload: payload,
    });
  } catch (err) {
    return fail(err);
  }
}

