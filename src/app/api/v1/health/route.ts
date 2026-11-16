import { getPool } from "@/db/pool";
import { kvStore } from "@/lib/redis";
import { ok, fail } from "@/lib/api-response";

export async function GET() {
  try {
    await getPool().query("SELECT 1");
    const redisOk = await kvStore.ping();
    return ok({
      status: "ok",
      service: "sakukilat-api-v1",
      postgres: "connected",
      redis: redisOk ? "connected" : "memory-fallback",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return fail(err);
  }
}

