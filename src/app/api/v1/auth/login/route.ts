import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api-response";
import { loginSchema } from "@/lib/validators";
import { loginWithPin } from "@/services/auth.service";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.parse(body);
    const result = await loginWithPin({
      phoneNumber: parsed.phone_number,
      pin: parsed.pin,
      deviceId: parsed.device_id || request.headers.get("x-device-id") || undefined,
    });

    const response = NextResponse.json({ data: result }, { status: 200 });
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

