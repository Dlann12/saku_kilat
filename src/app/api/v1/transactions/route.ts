import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { listUserTransactions } from "@/services/payment.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const sp = request.nextUrl.searchParams;
    const direction = (sp.get("direction") || "ALL") as "ALL" | "IN" | "OUT";
    const type = sp.get("type") || "ALL";
    const search = sp.get("q") || undefined;
    const from = sp.get("from") || undefined;
    const to = sp.get("to") || undefined;
    const limit = sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 50;

    const transactions = await listUserTransactions({
      userId: auth.userId,
      direction,
      type,
      search,
      from,
      to,
      limit,
    });
    return ok({ transactions });
  } catch (err) {
    return fail(err);
  }
}

