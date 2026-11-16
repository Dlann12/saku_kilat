import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth";
import { getPool } from "@/db/pool";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    await getPool().query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
      [auth.userId]
    );
    return ok({ markedRead: true });
  } catch (err) {
    return fail(err);
  }
}

