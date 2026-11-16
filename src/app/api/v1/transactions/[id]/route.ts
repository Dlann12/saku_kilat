import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { getTransactionDetail } from "@/services/payment.service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const detail = await getTransactionDetail(auth.userId, id);
    return ok(detail);
  } catch (err) {
    return fail(err);
  }
}

