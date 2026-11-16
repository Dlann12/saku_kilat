import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { getAdminOverview } from "@/services/merchant.service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const overview = await getAdminOverview();
    return ok(overview);
  } catch (err) {
    return fail(err);
  }
}

