import { NextResponse, type NextRequest } from "next/server";
import { fail, getIdempotencyKey } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { p2pTransferSchema } from "@/lib/validators";
import { runWithIdempotency } from "@/lib/idempotency";
import { executeP2pTransfer } from "@/services/payment.service";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = p2pTransferSchema.parse(body);
    const idempotencyKey = getIdempotencyKey(request);

    const res = await runWithIdempotency({
      idempotencyKey,
      userId: auth.userId,
      endpoint: "/api/v1/transfers/p2p",
      payload: parsed,
      execute: async () => {
        const tx = await executeP2pTransfer({
          userId: auth.userId,
          recipientPhone: parsed.recipient_phone,
          sourceWalletId: parsed.source_wallet_id,
          amount: parsed.amount,
          notes: parsed.notes,
          txAuthToken: parsed.tx_auth_token,
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

