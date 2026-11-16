import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { pinVerifySchema } from "@/lib/validators";
import { verifyPinForTx } from "@/services/auth.service";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = pinVerifySchema.parse(body);
    const result = await verifyPinForTx(auth.userId, parsed.pin);
    return ok({
      tx_auth_token: result.txAuthToken,
      expires_in_seconds: result.expiresInSeconds,
    });
  } catch (err) {
    return fail(err);
  }
}

