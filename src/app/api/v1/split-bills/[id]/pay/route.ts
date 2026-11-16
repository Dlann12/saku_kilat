import { NextResponse, type NextRequest } from "next/server";
import { fail, getIdempotencyKey } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { splitBillPaySchema } from "@/lib/validators";
import { runWithIdempotency } from "@/lib/idempotency";
import { paySplitBillShare } from "@/services/split-bill.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = splitBillPaySchema.parse(body);
    const idempotencyKey = getIdempotencyKey(request);

    const res = await runWithIdempotency({
      idempotencyKey,
      userId: auth.userId,
      endpoint: `/api/v1/split-bills/${id}/pay`,
      payload: parsed,
      execute: async () => {
        const tx = await paySplitBillShare({
          payerUserId: auth.userId,
          splitBillId: id,
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

