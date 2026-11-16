import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { getMerchantDashboard } from "@/services/merchant.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const dashboard = await getMerchantDashboard(auth.userId);
    return ok(dashboard);
  } catch (err) {
    return fail(err);
  }
}

