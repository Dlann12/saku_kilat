import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { splitBillCreateSchema } from "@/lib/validators";
import { createSplitBill, listSplitBills } from "@/services/split-bill.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const bills = await listSplitBills(auth.userId);
    return ok({ bills });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = splitBillCreateSchema.parse(body);
    const created = await createSplitBill({
      creatorUserId: auth.userId,
      title: parsed.title,
      splitMode: parsed.split_mode,
      participantPhones: parsed.participant_phones,
      totalAmount: parsed.total_amount,
      items: parsed.items,
    });
    return ok(created, 201);
  } catch (err) {
    return fail(err);
  }
}

