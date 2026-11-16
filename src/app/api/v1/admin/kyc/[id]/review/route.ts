import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { reviewKyc } from "@/services/auth.service";

const reviewSchema = z.object({
  decision: z.enum(["VERIFIED", "REJECTED"]),
  rejection_reason: z.string().trim().max(240).optional(),
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
          "Hanya akun Compliance Admin yang diizinkan menyetujui atau menolak KYC.",
          403
        )
      );
    }
    const { id } = await context.params;
    const body = await request.json();
    const parsed = reviewSchema.parse(body);

    const updated = await reviewKyc({
      documentId: id,
      decision: parsed.decision,
      rejectionReason: parsed.rejection_reason,
    });
    return ok(updated);
  } catch (err) {
    return fail(err);
  }
}
