import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "@/db/pool";
import { seedDatabase, SEED_IDS } from "@/db/seed";
import { closeRedis } from "@/lib/redis";
import {
  hashPin,
  verifyPin,
  encryptNik,
  decryptNik,
  hashNik,
  signHmacSha256,
  verifyHmacSha256,
  maskRecipientName,
  normalizePhoneNumber,
} from "@/lib/crypto";
import { buildQrisPayload, parseQrisPayload } from "@/lib/qris";
import {
  executeDoubleEntryTransaction,
  validateBalancedLegs,
} from "@/lib/ledger";
import { runWithIdempotency } from "@/lib/idempotency";

describe("Security Primitives, QRIS Parser, Idempotency & Concurrency", () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  afterAll(async () => {
    await closePool();
    await closeRedis();
  });

  it("hashes and verifies 6-digit PINs with scrypt + constant-time comparison", () => {
    const hashed = hashPin("123456");
    expect(hashed.startsWith("scrypt$")).toBe(true);
    expect(verifyPin("123456", hashed)).toBe(true);
    expect(verifyPin("654321", hashed)).toBe(false);
  });

  it("encrypts NIK with AES-256-GCM and hashes deterministically with SHA-256", () => {
    const nik = "1771011611990001";
    const enc1 = encryptNik(nik);
    const enc2 = encryptNik(nik);
    expect(enc1).not.toBe(enc2);
    expect(decryptNik(enc1)).toBe(nik);
    expect(decryptNik(enc2)).toBe(nik);
    expect(hashNik(nik)).toHaveLength(64);
    expect(hashNik(nik)).toBe(hashNik(nik));
  });

  it("validates HMAC-SHA256 webhook signatures and rejects expired anti-replay timestamps (>30s)", () => {
    const payload = JSON.stringify({ vaNumber: "3901011223344", amount: 100000 });
    const now = 1_760_000_000;
    const ts = String(now);
    const sig = signHmacSha256(payload, ts);

    expect(verifyHmacSha256(payload, ts, sig, 30, undefined, now + 10).valid).toBe(true);
    expect(verifyHmacSha256(payload, ts, sig, 30, undefined, now + 45)).toEqual({
      valid: false,
      reason: "REPLAY_WINDOW_EXCEEDED",
    });
    expect(verifyHmacSha256(payload, ts, "deadbeef", 30, undefined, now).valid).toBe(false);
  });

  it("builds and decodes EMVCo QRIS static and dynamic payloads with valid CRC-16", () => {
    const staticQr = buildQrisPayload({
      nmid: "ID1026177100022",
      merchantName: "Kopi Kenangan Bengkulu",
      merchantCity: "Kota Bengkulu",
      isDynamic: false,
    });
    const parsedStatic = parseQrisPayload(staticQr);
    expect(parsedStatic.valid).toBe(true);
    expect(parsedStatic.crcValid).toBe(true);
    expect(parsedStatic.isDynamic).toBe(false);
    expect(parsedStatic.merchantName).toBe("Kopi Kenangan Bengkulu");
    expect(parsedStatic.amount).toBeNull();

    const dynamicQr = buildQrisPayload({
      nmid: "ID1026177100011",
      merchantName: "Warung Kopi Pak Budi",
      merchantCity: "Kota Bengkulu",
      amount: 38000,
      isDynamic: true,
    });
    const parsedDyn = parseQrisPayload(dynamicQr);
    expect(parsedDyn.valid).toBe(true);
    expect(parsedDyn.isDynamic).toBe(true);
    expect(parsedDyn.amount).toBe(38000);

    const tampered = dynamicQr.slice(0, -1) + (dynamicQr.endsWith("0") ? "1" : "0");
    expect(parseQrisPayload(tampered).valid).toBe(false);
  });

  it("normalizes Indonesian phone numbers and masks recipient names per US-05", () => {
    expect(normalizePhoneNumber("0812-3456-7890")).toBe("+6281234567890");
    expect(normalizePhoneNumber("6285211223344")).toBe("+6285211223344");
    expect(maskRecipientName("Raka Pratama")).toBe("Raka Pr*****");
  });

  it("rejects imbalanced ledger legs before hitting the database", () => {
    expect(() =>
      validateBalancedLegs([
        { walletId: "a", entryType: "DEBIT", amount: 50000, description: "d" },
        { walletId: "b", entryType: "CREDIT", amount: 49999, description: "c" },
      ])
    ).toThrow(/imbalance|violation/i);
  });

  it("handles concurrent P2P transfers between two wallets without deadlock or negative balance", async () => {
    const dlanMain = "21000000-0000-4000-8000-000000000001";
    const rakaMain = "22000000-0000-4000-8000-000000000001";

    const beforeRes = await getPool().query<{ balance: string }>(
      `SELECT SUM(balance)::text AS balance FROM wallets WHERE id IN ($1, $2)`,
      [dlanMain, rakaMain]
    );
    const totalBefore = parseFloat(beforeRes.rows[0].balance);

    const ops = Array.from({ length: 6 }, (_, i) => {
      const fromDlan = i % 2 === 0;
      return executeDoubleEntryTransaction({
        userId: fromDlan ? SEED_IDS.dlan : SEED_IDS.raka,
        counterpartyUserId: fromDlan ? SEED_IDS.raka : SEED_IDS.dlan,
        idempotencyKey: `conc-test-${i}-${Date.now()}`,
        transactionType: "TRANSFER_P2P",
        amount: 10000,
        title: `Concurrent test ${i}`,
        category: "Transfer",
        sourceWalletId: fromDlan ? dlanMain : rakaMain,
        destinationWalletId: fromDlan ? rakaMain : dlanMain,
        legs: [
          {
            walletId: fromDlan ? dlanMain : rakaMain,
            entryType: "DEBIT",
            amount: 10000,
            description: "Concurrent debit",
          },
          {
            walletId: fromDlan ? rakaMain : dlanMain,
            entryType: "CREDIT",
            amount: 10000,
            description: "Concurrent credit",
          },
        ],
      });
    });

    await Promise.all(ops);

    const afterRes = await getPool().query<{ balance: string }>(
      `SELECT SUM(balance)::text AS balance FROM wallets WHERE id IN ($1, $2)`,
      [dlanMain, rakaMain]
    );
    expect(parseFloat(afterRes.rows[0].balance)).toBe(totalBefore);
  });

  it("enforces X-Idempotency-Key replay and rejects mismatched payloads with 409", async () => {
    const key = `idem-key-${Date.now()}`;
    let calls = 0;

    const first = await runWithIdempotency({
      idempotencyKey: key,
      userId: SEED_IDS.dlan,
      endpoint: "/api/v1/transfers/p2p",
      payload: { amount: 15000, recipientPhone: "+6281234567890" },
      execute: async () => {
        calls += 1;
        return { status: 201, body: { ref: "SK-123" } };
      },
    });
    expect(first.replayed).toBe(false);
    expect(calls).toBe(1);

    const replay = await runWithIdempotency({
      idempotencyKey: key,
      userId: SEED_IDS.dlan,
      endpoint: "/api/v1/transfers/p2p",
      payload: { amount: 15000, recipientPhone: "+6281234567890" },
      execute: async () => {
        calls += 1;
        return { status: 201, body: { ref: "SK-999" } };
      },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.body).toEqual({ ref: "SK-123" });
    expect(calls).toBe(1);

    await expect(
      runWithIdempotency({
        idempotencyKey: key,
        userId: SEED_IDS.dlan,
        endpoint: "/api/v1/transfers/p2p",
        payload: { amount: 99000, recipientPhone: "+6281234567890" },
        execute: async () => ({ status: 201, body: {} }),
      })
    ).rejects.toThrow(/digunakan|conflict/i);
  });
});

