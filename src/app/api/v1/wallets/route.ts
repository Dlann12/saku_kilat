import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { listUserWallets } from "@/services/wallet.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const data = await listUserWallets(auth.userId);
    return ok(data);
  } catch (err) {
    return fail(err);
  }
}

