import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { signHmacSha256 } from "@/lib/crypto";
import { processTopupWebhook } from "@/services/wallet.service";

const triggerSchema = z.object({
  external_ref: z.string().trim().min(5),
});

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const parsed = triggerSchema.parse(body);

    const rawBody = JSON.stringify({ external_ref: parsed.external_ref });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signHmacSha256(rawBody, timestamp);

    const result = await processTopupWebhook({
      externalRef: parsed.external_ref,
      rawBody,
      timestamp,
      signature,
    });
    return ok({
      ...result,
      hmacTrace: {
        timestamp,
        signaturePrefix: `${signature.slice(0, 16)}...`,
      },
    });
  } catch (err) {
    return fail(err);
  }
}

