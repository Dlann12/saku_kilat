import Redis from "ioredis";

declare global {
  var __sakukilatRedis: Redis | undefined;
  var __sakukilatMemoryKv: Map<string, { value: string; expiresAt: number | null }> | undefined;
}

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6381";

function getMemoryStore(): Map<string, { value: string; expiresAt: number | null }> {
  if (!globalThis.__sakukilatMemoryKv) {
    globalThis.__sakukilatMemoryKv = new Map();
  }
  return globalThis.__sakukilatMemoryKv;
}

function getRedisClient(): Redis {
  if (!globalThis.__sakukilatRedis) {
    const client = new Redis(process.env.REDIS_URL || DEFAULT_REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on("error", () => {
      // Fallbacks handle transient connection failures gracefully in tests/dev
    });
    globalThis.__sakukilatRedis = client;
  }
  return globalThis.__sakukilatRedis;
}

async function ensureConnected(client: Redis): Promise<boolean> {
  try {
    if (client.status === "ready") return true;
    if (client.status === "wait") {
      await client.connect();
    }
    return (client.status as string) === "ready";
  } catch {
    return false;
  }
}

export const kvStore = {
  async get(key: string): Promise<string | null> {
    const client = getRedisClient();
    if (await ensureConnected(client)) {
      try {
        return await client.get(key);
      } catch {
        // fallback below
      }
    }
    const mem = getMemoryStore().get(key);
    if (!mem) return null;
    if (mem.expiresAt !== null && Date.now() > mem.expiresAt) {
      getMemoryStore().delete(key);
      return null;
    }
    return mem.value;
  },

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = getRedisClient();
    if (await ensureConnected(client)) {
      try {
        if (ttlSeconds && ttlSeconds > 0) {
          await client.set(key, value, "EX", ttlSeconds);
        } else {
          await client.set(key, value);
        }
        return;
      } catch {
        // fallback below
      }
    }
    getMemoryStore().set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  },

  async del(key: string): Promise<void> {
    const client = getRedisClient();
    if (await ensureConnected(client)) {
      try {
        await client.del(key);
        return;
      } catch {
        // fallback below
      }
    }
    getMemoryStore().delete(key);
  },

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const client = getRedisClient();
    if (await ensureConnected(client)) {
      try {
        const count = await client.incr(key);
        if (count === 1) {
          await client.expire(key, ttlSeconds);
        }
        return count;
      } catch {
        // fallback below
      }
    }
    const current = await this.get(key);
    const next = (current ? parseInt(current, 10) : 0) + 1;
    await this.set(key, String(next), ttlSeconds);
    return next;
  },

  async ttl(key: string): Promise<number> {
    const client = getRedisClient();
    if (await ensureConnected(client)) {
      try {
        return await client.ttl(key);
      } catch {
        // fallback below
      }
    }
    const mem = getMemoryStore().get(key);
    if (!mem || mem.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((mem.expiresAt - Date.now()) / 1000));
  },

  async ping(): Promise<boolean> {
    const client = getRedisClient();
    if (await ensureConnected(client)) {
      try {
        const res = await client.ping();
        return res === "PONG";
      } catch {
        return false;
      }
    }
    return false;
  },
};

export async function closeRedis(): Promise<void> {
  if (globalThis.__sakukilatRedis) {
    try {
      await globalThis.__sakukilatRedis.quit();
    } catch {
      globalThis.__sakukilatRedis.disconnect();
    }
    globalThis.__sakukilatRedis = undefined;
  }
}
