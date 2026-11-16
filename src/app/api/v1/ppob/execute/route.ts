import { NextResponse, type NextRequest } from "next/server";
import { fail, getIdempotencyKey } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { ppobExecuteSchema } from "@/lib/validators";
import { runWithIdempotency } from "@/lib/idempotency";
import { executePpob } from "@/services/payment.service";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = ppobExecuteSchema.parse(body);
    const idempotencyKey = getIdempotencyKey(request);

    const res = await runWithIdempotency({
      idempotencyKey,
      userId: auth.userId,
      endpoint: "/api/v1/ppob/execute",
      payload: parsed,
      execute: async () => {
        const tx = await executePpob({
          userId: auth.userId,
          productCode: parsed.product_code,
          customerNumber: parsed.customer_number,
          sourceWalletId: parsed.source_wallet_id,
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

