import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { createPocketSchema } from "@/lib/validators";
import { createSmartPocket } from "@/services/wallet.service";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = createPocketSchema.parse(body);
    const pocket = await createSmartPocket({
      userId: auth.userId,
      name: parsed.name,
      categoryKey: parsed.category_key,
      targetAmount: parsed.target_amount,
    });
    return ok(pocket, 201);
  } catch (err) {
    return fail(err);
  }
}

