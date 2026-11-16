import type { NextRequest } from "next/server";
import { ok } from "@/lib/api-response";
import { SESSION_COOKIE_NAME, verifySessionJwt } from "@/lib/auth";
import { getProfileSummary } from "@/services/auth.service";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return ok({ authenticated: false, profile: null });
    }
    const payload = verifySessionJwt(token);
    if (!payload) {
      return ok({ authenticated: false, profile: null });
    }
    const profile = await getProfileSummary(payload.sub);
    return ok({ authenticated: true, profile });
  } catch {
    return ok({ authenticated: false, profile: null });
  }
}

