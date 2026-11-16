import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { lookupP2pRecipient } from "@/services/payment.service";
import { DomainError } from "@/lib/ledger";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const phone = request.nextUrl.searchParams.get("phone") || "";
    if (!phone.trim()) {
      throw new DomainError("PHONE_REQUIRED", "Parameter phone wajib diisi.", 400);
    }
    const recipient = await lookupP2pRecipient(phone);
    return ok(recipient);
  } catch (err) {
    return fail(err);
  }
}

