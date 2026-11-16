import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { authorizeBiometricTx, toggleBiometric } from "@/services/auth.service";

const bioSchema = z.object({
  action: z.enum(["toggle", "authorize"]),
  enabled: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = bioSchema.parse(body);
    if (parsed.action === "toggle") {
      const updated = await toggleBiometric(auth.userId, Boolean(parsed.enabled));
      return ok(updated);
    }
    const result = await authorizeBiometricTx(auth.userId);
    return ok({
      tx_auth_token: result.txAuthToken,
      expires_in_seconds: result.expiresInSeconds,
    });
  } catch (err) {
    return fail(err);
  }
}

