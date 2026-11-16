import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { kycSubmitSchema } from "@/lib/validators";
import { getProfileSummary, submitKyc } from "@/services/auth.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const summary = await getProfileSummary(auth.userId);
    return ok({
      kyc_status: summary.user.kyc_status,
      balance_limit: summary.balanceLimit,
      latest_document: summary.latestKyc,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();
    const parsed = kycSubmitSchema.parse(body);
    const doc = await submitKyc({
      userId: auth.userId,
      nik: parsed.nik,
      fullNameKtp: parsed.full_name_ktp,
      ktpImageUrl: parsed.ktp_image_url,
      selfieImageUrl: parsed.selfie_image_url,
    });
    return ok(doc, 201);
  } catch (err) {
    return fail(err);
  }
}

