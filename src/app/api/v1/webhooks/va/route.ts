import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { processTopupWebhook } from "@/services/wallet.service";

const webhookSchema = z.object({
  external_ref: z.string().trim().min(5),
});

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const timestamp = request.headers.get("x-timestamp") || "";
    const signature = request.headers.get("x-signature") || "";
    const parsed = webhookSchema.parse(JSON.parse(rawBody));

    const result = await processTopupWebhook({
      externalRef: parsed.external_ref,
      rawBody,
      timestamp,
      signature,
    });
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

