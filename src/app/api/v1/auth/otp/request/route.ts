import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { otpRequestSchema } from "@/lib/validators";
import { requestOtp } from "@/services/auth.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = otpRequestSchema.parse(body);
    const result = await requestOtp({
      phoneNumber: parsed.phone_number,
      channel: parsed.channel,
    });
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

