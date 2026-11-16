import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { qrisDecodeSchema } from "@/lib/validators";
import { decodeQris } from "@/services/payment.service";

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const parsed = qrisDecodeSchema.parse(body);
    const decoded = await decodeQris(parsed.raw_qr_payload);
    return ok(decoded);
  } catch (err) {
    return fail(err);
  }
}

