import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api-response";
import { otpVerifySchema } from "@/lib/validators";
import { verifyOtp } from "@/services/auth.service";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = otpVerifySchema.parse(body);
    const result = await verifyOtp({
      phoneNumber: parsed.phone_number,
      otpCode: parsed.otp_code,
      purpose: parsed.purpose,
      deviceId: request.headers.get("x-device-id") || undefined,
    });

    const response = NextResponse.json({ data: result }, { status: 200 });
    if (result.mode === "LOGIN" && "token" in result && result.token) {
      response.cookies.set(SESSION_COOKIE_NAME, result.token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    return response;
  } catch (err) {
    return fail(err);
  }
}

