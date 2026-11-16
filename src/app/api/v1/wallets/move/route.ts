import { NextResponse, type NextRequest } from "next/server";
import { fail, getIdempotencyKey } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { movePocketSchema } from "@/lib/validators";
import { runWithIdempotency } from "@/lib/idempotency";
import { movePocketBalance } from "@/services/wallet.service";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = movePocketSchema.parse(body);
    const idempotencyKey = getIdempotencyKey(request);

    const res = await runWithIdempotency({
      idempotencyKey,
      userId: auth.userId,
      endpoint: "/api/v1/wallets/move",
      payload: parsed,
      execute: async () => {
        const tx = await movePocketBalance({
          userId: auth.userId,
          sourceWalletId: parsed.source_wallet_id,
          destinationWalletId: parsed.destination_wallet_id,
          amount: parsed.amount,
          idempotencyKey: idempotencyKey!,
        });
        return { status: 201, body: { data: tx } };
      },
    });

    return NextResponse.json(res.body, { status: res.status });
  } catch (err) {
    return fail(err);
  }
}

