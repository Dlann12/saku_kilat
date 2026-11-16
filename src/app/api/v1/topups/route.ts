import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { createTopupSchema } from "@/lib/validators";
import { createTopupOrder, TOPUP_CHANNELS } from "@/services/wallet.service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    return ok({ channels: TOPUP_CHANNELS });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = createTopupSchema.parse(body);
    const order = await createTopupOrder({
      userId: auth.userId,
      channel: parsed.channel,
      amount: parsed.amount,
    });
    return ok(order, 201);
  } catch (err) {
    return fail(err);
  }
}

