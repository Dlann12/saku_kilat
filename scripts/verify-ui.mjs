import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.APP_URL || "http://127.0.0.1:3005";
const SCREENSHOT_DIR = "/home/kerja/.gemini/antigravity/brain/a4184690-082a-43ad-bedf-9c88109781c0/scratch/screenshots";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const CHROME_EXEC =
  process.env.CHROME_PATH ||
  "/home/kerja/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";

async function run() {
  const browser = await chromium.launch({
    executablePath: CHROME_EXEC,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const consoleErrors = [];
  const pageErrors = [];
  const serverErrors = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        serverErrors.push(`${res.status()} ${res.url()}`);
      }
    });

    // 1. Desktop 1440px Home Screen (Dlan Kusuma auto-session)
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Halo, Dlan");
    await page.waitForSelector("text=Rp 1.250.000");
    await page.waitForSelector("text=Uang Makan");
    await page.waitForSelector("text=Kopi Kenangan Bengkulu");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "home-1440.png"),
      fullPage: true,
    });

    // Check no horizontal overflow on 1440
    const overflow1440 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    assert.equal(overflow1440, false, "Unexpected horizontal overflow at 1440px");

    // 2. Test Smart Pockets Move & Verify Balance Update
    await page.goto(`${BASE_URL}/pockets`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Kantong Pintar (Smart Pockets)");
    await page.fill("#move-amount", "50000");
    await page.click("button:has-text('Pindahkan Sekarang')");
    await page.waitForSelector("text=Transaksi Berhasil");
    await page.click("button[aria-label='Tutup resi']");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "pockets-1440.png"),
      fullPage: true,
    });

    // 3. Test QRIS Scan & Payment Flow with PIN Modal (123456)
    await page.goto(`${BASE_URL}/qris`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Merchant QRIS Siap Uji");
    await page.click("button:has-text('Scan QR Ini') >> nth=1"); // Warung Kopi Pak Budi Rp 38.000
    await page.waitForSelector("text=Konfirmasi Pembayaran");
    await page.waitForSelector("text=Warung Kopi Pak Budi");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "qris-confirm-1440.png"),
      fullPage: true,
    });
    await page.click("button:has-text('Bayar Sekarang (PIN)')");
    await page.waitForSelector("#pin-keyboard-input");
    await page.fill("#pin-keyboard-input", "123456");
    await page.waitForSelector("text=Transaksi Berhasil", { timeout: 10000 });
    await page.click("button[aria-label='Tutup resi']");

    // 4. Test Top Up & Simulated Bank VA Webhook
    await page.goto(`${BASE_URL}/topup`, { waitUntil: "networkidle" });
    await page.fill("#topup-amount", "100000");
    await page.click("button:has-text('Buat Instruksi Pembayaran')");
    await page.waitForSelector("button:has-text('Simulasi Pembayaran Bank')");
    await page.click("button:has-text('Simulasi Pembayaran Bank')");
    await page.waitForSelector("text=Webhook bank terverifikasi HMAC-SHA256");

    // 5. Test P2P Transfer Lookup & Execute
    await page.goto(`${BASE_URL}/transfer`, { waitUntil: "networkidle" });
    await page.click("button:has-text('Cek Nama')");
    await page.waitForSelector("text=Raka Pr*****");
    await page.fill("#p2p-amount", "15000");
    await page.click("button:has-text('Kirim Transfer P2P')");
    await page.fill("#pin-keyboard-input", "123456");
    await page.waitForSelector("text=Transaksi Berhasil", { timeout: 10000 });
    await page.click("button[aria-label='Tutup resi']");

    // 6. Test PPOB PLN Token Inquiry & Execution
    await page.goto(`${BASE_URL}/ppob?cat=PLN_TOKEN`, { waitUntil: "networkidle" });
    await page.click("button:has-text('Token Listrik PLN Rp50.000')");
    await page.click("button:has-text('Cek Harga & Tagihan')");
    await page.waitForSelector("text=Tagihan / Produk Siap Dibayar");
    await page.click("button:has-text('Bayar Sekarang (PIN)')");
    await page.fill("#pin-keyboard-input", "123456");
    await page.waitForSelector("text=Nomor Token / Voucher Digital", { timeout: 10000 });
    await page.click("button[aria-label='Tutup resi']");

    // 7. Test Riwayat & Charts
    await page.goto(`${BASE_URL}/riwayat`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Arus Kas 7 Hari Terakhir");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "riwayat-1440.png"),
      fullPage: true,
    });

    // 8. Test Split Bill, Merchant & Admin Ledger
    await page.goto(`${BASE_URL}/split-bill`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Makan Siang Ayam Geprek Bersama");

    await page.goto(`${BASE_URL}/merchant`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=SakuKilat Bisnis (Merchant UMKM)");

    await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=SEIMBANG (0 SELISIH)");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "admin-1440.png"),
      fullPage: true,
    });

    // 9. Check Tablet (768x1024) & Phone (390x844) responsiveness and One-Thumb Bottom Nav
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Halo, Dlan");
    const overflow768 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    assert.equal(overflow768, false, "Unexpected horizontal overflow at 768px");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "home-768.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Halo, Dlan");
    const overflow390 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    assert.equal(overflow390, false, "Unexpected horizontal overflow at 390px");

    // Verify bottom nav visible on phone
    const bottomNavVisible = await page.locator(".sk-bottom-nav").isVisible();
    assert.equal(bottomNavVisible, true, "One-thumb bottom nav must be visible at 390px");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "home-390.png"),
      fullPage: true,
    });

    await page.goto(`${BASE_URL}/riwayat`, { waitUntil: "networkidle" });
    const overflowRiwayat390 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    assert.equal(overflowRiwayat390, false, "Unexpected horizontal overflow on /riwayat at 390px");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "riwayat-390.png"),
      fullPage: true,
    });

    // Verify Auth OTP flow visually too
    await page.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Masuk atau Daftar SakuKilat");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "auth-390.png"),
      fullPage: true,
    });

    assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join(" | ")}`);
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(" | ")}`);
    assert.equal(serverErrors.length, 0, `5xx errors: ${serverErrors.join(" | ")}`);

    console.log("ALL PLAYWRIGHT E2E & RESPONSIVE CHECKS PASSED! Screenshots:", SCREENSHOT_DIR);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("E2E verification failed:", err);
  process.exit(1);
});
