import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { ppobInquireSchema } from "@/lib/validators";
import { inquirePpob } from "@/services/payment.service";

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const parsed = ppobInquireSchema.parse(body);
    const inquiry = await inquirePpob({
      productCode: parsed.product_code,
      customerNumber: parsed.customer_number,
    });
    return ok(inquiry);
  } catch (err) {
    return fail(err);
  }
}

