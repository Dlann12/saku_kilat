import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api-response";
import { registerSchema } from "@/lib/validators";
import { registerWithPin } from "@/services/auth.service";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.parse(body);
    const result = await registerWithPin({
      phoneNumber: parsed.phone_number,
      fullName: parsed.full_name,
      email: parsed.email || undefined,
      pin: parsed.pin,
      registrationToken: parsed.registration_token,
      deviceId: parsed.device_id || request.headers.get("x-device-id") || undefined,
    });

    const response = NextResponse.json({ data: result }, { status: 201 });
    response.cookies.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (err) {
    return fail(err);
  }
}

