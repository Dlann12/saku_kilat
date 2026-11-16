import { NextResponse, type NextRequest } from "next/server";
import { fail, getIdempotencyKey } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { qrisExecuteSchema } from "@/lib/validators";
import { runWithIdempotency } from "@/lib/idempotency";
import { executeQrisPayment } from "@/services/payment.service";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = qrisExecuteSchema.parse(body);
    const idempotencyKey = getIdempotencyKey(request);

    const res = await runWithIdempotency({
      idempotencyKey,
      userId: auth.userId,
      endpoint: "/api/v1/payments/qris/execute",
      payload: parsed,
      execute: async () => {
        const tx = await executeQrisPayment({
          userId: auth.userId,
          inquiryId: parsed.inquiry_id,
          rawQrPayload: parsed.raw_qr_payload,
          sourceWalletId: parsed.source_wallet_id,
          amount: parsed.amount,
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

