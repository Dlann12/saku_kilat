import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { updatePocketSchema } from "@/lib/validators";
import { updateSmartPocket } from "@/services/wallet.service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updatePocketSchema.parse(body);
    const updated = await updateSmartPocket({
      userId: auth.userId,
      pocketId: id,
      name: parsed.name,
      targetAmount: parsed.target_amount,
      isLocked: parsed.is_locked,
    });
    return ok(updated);
  } catch (err) {
    return fail(err);
  }
}

