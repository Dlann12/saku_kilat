import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { reverseTransaction } from "@/services/merchant.service";

const reverseSchema = z.object({
  reason: z.string().trim().min(3).max(200).default("Timeout / Rekonsiliasi Harian Otomatis"),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "ADMIN") {
      return fail(
        new (await import("@/lib/ledger")).DomainError(
          "FORBIDDEN",
          "Hanya akun Compliance Admin yang dapat mengeksekusi Auto-Reversal.",
          403
        )
      );
    }
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = reverseSchema.parse(body);
    const result = await reverseTransaction({
      transactionId: id,
      reason: parsed.reason,
    });
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
