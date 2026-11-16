import { NextResponse, type NextRequest } from "next/server";
import { fail, getIdempotencyKey } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { merchantSettleSchema } from "@/lib/validators";
import { runWithIdempotency } from "@/lib/idempotency";
import { settleMerchantBalance } from "@/services/merchant.service";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = merchantSettleSchema.parse(body);
    const idempotencyKey = getIdempotencyKey(request);

    const res = await runWithIdempotency({
      idempotencyKey,
      userId: auth.userId,
      endpoint: "/api/v1/merchant/settle",
      payload: parsed,
      execute: async () => {
        const tx = await settleMerchantBalance({
          userId: auth.userId,
          merchantId: parsed.merchant_id,
          amount: parsed.amount,
          destinationBank: parsed.destination_bank,
          accountNumber: parsed.account_number,
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

