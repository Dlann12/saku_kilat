import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/db/pool";
import { fail } from "@/lib/api-response";
import { SESSION_COOKIE_NAME, signSessionJwt } from "@/lib/auth";
import { DomainError } from "@/lib/ledger";

const switchSchema = z.object({
  user_id: z.string().uuid().optional(),
  phone_number: z.string().optional(),
});

export async function GET() {
  try {
    const res = await getPool().query<{
      id: string;
      phone_number: string;
      full_name: string;
      kyc_status: string;
      role: string;
    }>(
      `SELECT id, phone_number, full_name, kyc_status, role
       FROM users
       WHERE role <> 'SYSTEM' AND account_status = 'ACTIVE'
       ORDER BY created_at ASC`
    );
    return NextResponse.json({ data: res.rows });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = switchSchema.parse(body);

    const res = await getPool().query<{
      id: string;
      phone_number: string;
      full_name: string;
      kyc_status: string;
      role: string;
    }>(
      `SELECT id, phone_number, full_name, kyc_status, role
       FROM users
       WHERE ($1::uuid IS NOT NULL AND id = $1)
          OR ($2::text IS NOT NULL AND phone_number = $2)
       LIMIT 1`,
      [parsed.user_id || null, parsed.phone_number || null]
    );

    if (res.rowCount === 0) {
      throw new DomainError("USER_NOT_FOUND", "Akun demo tidak ditemukan.", 404);
    }

    const user = res.rows[0];
    const token = signSessionJwt({
      sub: user.id,
      phone: user.phone_number,
      role: user.role,
      deviceId: `demo-switcher-${user.id.slice(-4)}`,
    });

    const response = NextResponse.json({ data: { user, token } });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
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

