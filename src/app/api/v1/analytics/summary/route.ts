import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { getMonthlyAnalytics } from "@/services/payment.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const summary = await getMonthlyAnalytics(auth.userId);
    return ok(summary);
  } catch (err) {
    return fail(err);
  }
}

