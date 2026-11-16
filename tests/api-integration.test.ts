import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool } from "@/db/pool";
import { seedDatabase, SEED_IDS } from "@/db/seed";
import { closeRedis, kvStore } from "@/lib/redis";
import {
  requestOtp,
  verifyOtp,
  registerWithPin,
  loginWithPin,
  verifyPinForTx,
  submitKyc,
  reviewKyc,
} from "@/services/auth.service";
import {
  listUserWallets,
  createSmartPocket,
  movePocketBalance,
  createTopupOrder,
  processTopupWebhook,
} from "@/services/wallet.service";
import {
  decodeQris,
  executeQrisPayment,
  lookupP2pRecipient,
  executeP2pTransfer,
  executeBankTransfer,
  inquirePpob,
  executePpob,
} from "@/services/payment.service";
import {
  createSplitBill,
  paySplitBillShare,
  listSplitBills,
} from "@/services/split-bill.service";
import {
  getMerchantDashboard,
  settleMerchantBalance,
  getAdminOverview,
  reverseTransaction,
} from "@/services/merchant.service";
import { buildQrisPayload } from "@/lib/qris";
import { signHmacSha256 } from "@/lib/crypto";

describe("SakuKilat End-to-End Business Logic & PRD Acceptance Criteria", () => {
  beforeAll(async () => {
    await seedDatabase();
    await kvStore.del("otp_lock:+6289900011122");
    await kvStore.del("otp_fail:+6289900011122");
    await kvStore.del("otp_code:+6289900011122");
  });

  afterAll(async () => {
    await closePool();
    await closeRedis();
  });

  it("US-01: registers user via OTP (180s), enforces 3x wrong OTP 15-min lockout, and provisions MAIN wallet Rp0", async () => {
    // Test 3x wrong OTP lockout on a dedicated test number
    const lockPhone = "+6289900011122";
    await requestOtp({ phoneNumber: lockPhone, channel: "WHATSAPP" });
    await expect(
      verifyOtp({ phoneNumber: lockPhone, otpCode: "000000", purpose: "REGISTER" })
    ).rejects.toThrow(/salah/i);
    await expect(
      verifyOtp({ phoneNumber: lockPhone, otpCode: "000001", purpose: "REGISTER" })
    ).rejects.toThrow(/salah/i);
    await expect(
      verifyOtp({ phoneNumber: lockPhone, otpCode: "000002", purpose: "REGISTER" })
    ).rejects.toThrow(/diblokir.*15 menit/i);

    await expect(
      requestOtp({ phoneNumber: lockPhone, channel: "SMS" })
    ).rejects.toThrow(/diblokir/i);

    // Test happy registration path
    const newPhone = "+6289988776655";
    const otpRes = await requestOtp({ phoneNumber: newPhone, channel: "WHATSAPP" });
    expect(otpRes.expires_in_seconds).toBe(180);
    expect(otpRes.sandbox_otp).toHaveLength(6);

    const verified = await verifyOtp({
      phoneNumber: newPhone,
      otpCode: otpRes.sandbox_otp!,
      purpose: "REGISTER",
    });
    expect(verified.verified).toBe(true);
    expect(verified.registration_token).toBeTruthy();

    const registered = await registerWithPin({
      phoneNumber: newPhone,
      fullName: "Andi Pratama",
      email: "andi@example.com",
      pin: "246810",
      registrationToken: verified.registration_token!,
    });
    expect(registered.user.kyc_status).toBe("UNVERIFIED");

    const wallets = await listUserWallets(registered.user.id);
    expect(wallets.mainBalance).toBe(0);
    expect(wallets.balanceLimit).toBe(2_000_000);

    const logged = await loginWithPin({ phoneNumber: newPhone, pin: "246810" });
    expect(logged.token).toBeTruthy();
  });

  it("US-02 & US-03: enforces Rp2M UNVERIFIED limit on VA webhook (LIMIT_EXCEEDED), upgrades via KYC to Rp20M, and credits Top Up", async () => {
    // Tania is UNVERIFIED with Rp1.850.000
    const orderExceed = await createTopupOrder({
      userId: SEED_IDS.tania,
      channel: "VA_BCA",
      amount: 300_000, // 1.85M + 300k = 2.15M > 2M
    });

    const rawBody1 = JSON.stringify({ external_ref: orderExceed.externalRef });
    const ts1 = String(Math.floor(Date.now() / 1000));
    const sig1 = signHmacSha256(rawBody1, ts1);

    await expect(
      processTopupWebhook({
        externalRef: orderExceed.externalRef,
        rawBody: rawBody1,
        timestamp: ts1,
        signature: sig1,
      })
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });

    // Bank transfer must fail before KYC verification
    const taniaWalletsBefore = await listUserWallets(SEED_IDS.tania);
    const taniaTxAuth = await verifyPinForTx(SEED_IDS.tania, "123456");
    await expect(
      executeBankTransfer({
        userId: SEED_IDS.tania,
        bankCode: "BCA",
        accountNumber: "1234567890",
        accountHolderName: "Tania Wijaya",
        sourceWalletId: taniaWalletsBefore.mainWallet!.id,
        amount: 50_000,
        txAuthToken: taniaTxAuth.txAuthToken,
        idempotencyKey: `tania-bank-fail-${Date.now()}`,
      })
    ).rejects.toThrow(/KYC VERIFIED/i);

    // Submit & approve KYC for Tania
    const doc = await submitKyc({
      userId: SEED_IDS.tania,
      nik: "3175011204980009",
      fullNameKtp: "TANIA WIJAYA",
      ktpImageUrl: "/sandbox/ktp.png",
      selfieImageUrl: "/sandbox/selfie.png",
    });
    expect(doc.status).toBe("PENDING");

    await reviewKyc({ documentId: doc.id, decision: "VERIFIED" });

    // Now Top Up Rp500.000 succeeds up to Rp20M limit!
    const orderOk = await createTopupOrder({
      userId: SEED_IDS.tania,
      channel: "VA_MANDIRI",
      amount: 500_000,
    });
    const rawBody2 = JSON.stringify({ external_ref: orderOk.externalRef });
    const ts2 = String(Math.floor(Date.now() / 1000));
    const sig2 = signHmacSha256(rawBody2, ts2);

    const paid = await processTopupWebhook({
      externalRef: orderOk.externalRef,
      rawBody: rawBody2,
      timestamp: ts2,
      signature: sig2,
    });
    expect(paid.status).toBe("PAID");

    const taniaAfter = await listUserWallets(SEED_IDS.tania);
    expect(taniaAfter.balanceLimit).toBe(20_000_000);
    expect(taniaAfter.mainBalance).toBe(2_350_000);
  });

  it("US-04 & Smart Pockets: creates pocket, moves Rp0 fee, decodes & pays dynamic QRIS atomically", async () => {
    const walletsBefore = await listUserWallets(SEED_IDS.dlan);
    const pocket = await createSmartPocket({
      userId: SEED_IDS.dlan,
      name: "Kopi & Nongkrong",
      categoryKey: "food",
      targetAmount: 300_000,
    });

    await movePocketBalance({
      userId: SEED_IDS.dlan,
      sourceWalletId: walletsBefore.mainWallet!.id,
      destinationWalletId: pocket.id,
      amount: 100_000,
      idempotencyKey: `move-pocket-${Date.now()}`,
    });

    const dynamicQr = buildQrisPayload({
      nmid: "ID1026177100011",
      merchantName: "Warung Kopi Pak Budi",
      merchantCity: "Kota Bengkulu",
      amount: 35_000,
      isDynamic: true,
    });

    const decoded = await decodeQris(dynamicQr);
    expect(decoded.kind).toBe("QRIS");
    if (decoded.kind !== "QRIS") throw new Error("Expected QRIS");
    expect(decoded.amount).toBe(35_000);

    const pinRes = await verifyPinForTx(SEED_IDS.dlan, "123456");
    const qrisTx = await executeQrisPayment({
      userId: SEED_IDS.dlan,
      inquiryId: decoded.inquiryId,
      sourceWalletId: pocket.id,
      amount: 35_000,
      txAuthToken: pinRes.txAuthToken,
      idempotencyKey: `qris-pay-${Date.now()}`,
    });
    expect(qrisTx.status).toBe("SUCCESS");
    expect(qrisTx.adminFee).toBe(0);

    const walletsAfter = await listUserWallets(SEED_IDS.dlan);
    const updatedPocket = walletsAfter.pockets.find((p) => p.id === pocket.id)!;
    expect(updatedPocket.balance).toBe(65_000);
  });

  it("US-05 & BI-FAST Quota: masks P2P name, executes Rp0 P2P transfer, and applies Rp2.500 fee on 11th monthly BI-FAST transfer", async () => {
    const lookup = await lookupP2pRecipient("081234567890");
    expect(lookup.maskedName).toBe("Raka Pr*****");

    const sariWallets = await listUserWallets(SEED_IDS.sari);
    const pin1 = await verifyPinForTx(SEED_IDS.sari, "123456");
    const p2p = await executeP2pTransfer({
      userId: SEED_IDS.sari,
      recipientPhone: "081234567890",
      sourceWalletId: sariWallets.mainWallet!.id,
      amount: 50_000,
      notes: "Uang buku",
      txAuthToken: pin1.txAuthToken,
      idempotencyKey: `sari-p2p-${Date.now()}`,
    });
    expect(p2p.adminFee).toBe(0);

    // Run 10 free BI-FAST transfers, then 11th must charge Rp2.500
    for (let i = 1; i <= 10; i++) {
      const tok = await verifyPinForTx(SEED_IDS.sari, "123456");
      const tx = await executeBankTransfer({
        userId: SEED_IDS.sari,
        bankCode: "BCA",
        accountNumber: "8800112233",
        accountHolderName: "Sari Wulandari",
        sourceWalletId: sariWallets.mainWallet!.id,
        amount: 10_000,
        txAuthToken: tok.txAuthToken,
        idempotencyKey: `bifast-free-${i}-${Date.now()}`,
      });
      expect(tx.adminFee).toBe(0);
    }

    const tok11 = await verifyPinForTx(SEED_IDS.sari, "123456");
    const tx11 = await executeBankTransfer({
      userId: SEED_IDS.sari,
      bankCode: "MANDIRI",
      accountNumber: "1300012345678",
      accountHolderName: "Sari Wulandari",
      sourceWalletId: sariWallets.mainWallet!.id,
      amount: 10_000,
      txAuthToken: tok11.txAuthToken,
      idempotencyKey: `bifast-paid-11-${Date.now()}`,
    });
    expect(tx11.adminFee).toBe(2_500);
    expect(tx11.totalAmount).toBe(12_500);
  });

  it("PPOB & Split Bill & Merchant & Admin Reversal keep double-entry ledger 100% balanced", async () => {
    const rakaWallets = await listUserWallets(SEED_IDS.raka);

    // 1. PPOB PLN Token
    const inq = await inquirePpob({
      productCode: "PLN_TOKEN_50",
      customerNumber: "541200011122",
    });
    expect(inq.totalPayable).toBe(52_500);

    const rakaPin1 = await verifyPinForTx(SEED_IDS.raka, "123456");
    const ppobTx = await executePpob({
      userId: SEED_IDS.raka,
      productCode: "PLN_TOKEN_50",
      customerNumber: "541200011122",
      sourceWalletId: rakaWallets.mainWallet!.id,
      txAuthToken: rakaPin1.txAuthToken,
      idempotencyKey: `ppob-pln-${Date.now()}`,
    });
    expect(String(ppobTx.metadata.tokenNumber)).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}-\d{4}$/);

    // 2. Split Bill (Itemized) created by Dlan & paid by Raka
    const sb = await createSplitBill({
      creatorUserId: SEED_IDS.dlan,
      title: "Ngopi Sore Tim",
      splitMode: "ITEMIZED",
      participantPhones: ["+6281234567890"],
      items: [
        { name: "Kopi Susu Dlan", price: 25_000, assigned_phones: ["+6285211223344"] },
        { name: "Matcha Latte Raka", price: 30_000, assigned_phones: ["+6281234567890"] },
      ],
    });
    expect(sb.totalAmount).toBe(55_000);

    const rakaPin2 = await verifyPinForTx(SEED_IDS.raka, "123456");
    await paySplitBillShare({
      payerUserId: SEED_IDS.raka,
      splitBillId: sb.id,
      sourceWalletId: rakaWallets.mainWallet!.id,
      txAuthToken: rakaPin2.txAuthToken,
      idempotencyKey: `sb-pay-${Date.now()}`,
    });
    const dlanBills = await listSplitBills(SEED_IDS.dlan);
    const settledBill = dlanBills.find((b) => b.id === sb.id)!;
    expect(settledBill.status).toBe("SETTLED");

    // 3. Merchant Instant Settlement (Pak Budi)
    const budiDash = await getMerchantDashboard(SEED_IDS.pakBudi);
    const warung = budiDash.merchants[0];
    expect(warung.balance).toBeGreaterThanOrEqual(20_000);

    const budiPin = await verifyPinForTx(SEED_IDS.pakBudi, "123456");
    const settleTx = await settleMerchantBalance({
      userId: SEED_IDS.pakBudi,
      merchantId: warung.id,
      amount: 20_000,
      destinationBank: "BRI",
      accountNumber: "009988776655",
      txAuthToken: budiPin.txAuthToken,
      idempotencyKey: `settle-${Date.now()}`,
    });
    expect(settleTx.adminFee).toBe(2_500);

    // 4. Admin Auto-Reversal on PPOB or Settle (let's reverse the P2P or Merchant Settle)
    await reverseTransaction({
      transactionId: settleTx.id,
      reason: "Simulasi rekonsiliasi timeout bank",
    });

    // 5. Final Global Double-Entry Reconciliation Check
    const admin = await getAdminOverview();
    expect(admin.ledgerInvariant.balanced).toBe(true);
    expect(admin.ledgerInvariant.discrepancy).toBe(0);
  });
});
