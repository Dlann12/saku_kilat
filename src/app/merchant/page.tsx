"use client";

import React, { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Banknote, QrCode, Store } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import { formatDateTimeWib, formatRupiah, makeIdempotencyKey } from "@/components/Formatters";
import { PinAuthModal } from "@/components/PinAuthModal";
import { ReceiptModal, type ReceiptTransaction } from "@/components/ReceiptModal";

interface MerchantInfo {
  id: string;
  nmid: string;
  merchantName: string;
  merchantCity: string;
  category: string;
  categoryScale: string;
  mdrBps: number;
  settlementWalletId: string;
  balance: number;
  staticQrisPayload: string;
}

interface MerchantDashboard {
  isOwner: boolean;
  totalSettlementBalance: number;
  totalQrisGross: number;
  merchants: MerchantInfo[];
  incomingQris: Array<{
    id: string;
    referenceNumber: string;
    title: string;
    amount: number;
    status: string;
    mdrFee: number;
    createdAt: string;
  }>;
  settlements: Array<{
    id: string;
    referenceNumber: string;
    title: string;
    amount: number;
    adminFee: number;
    status: string;
    createdAt: string;
  }>;
}

export default function MerchantPage() {
  const { profile, demoUsers, switchDemoUser } = useSession();
  const [dash, setDash] = useState<MerchantDashboard | null>(null);
  const [selectedMerchantId, setSelectedMerchantId] = useState("");
  const [dynamicAmount, setDynamicAmount] = useState("45000");
  const [generatedPayload, setGeneratedPayload] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  const [settleAmount, setSettleAmount] = useState("20000");
  const [bankName, setBankName] = useState("BRI");
  const [bankAcc, setBankAcc] = useState("009988776655");

  const [pinOpen, setPinOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMerchant = useCallback(async () => {
    if (!profile) return;
    const res = await apiFetch<MerchantDashboard>("/api/v1/merchant");
    setDash(res);
    if (res.merchants.length > 0) {
      const m =
        res.merchants.find((x) => x.id === selectedMerchantId) || res.merchants[0];
      setSelectedMerchantId(m.id);
      setGeneratedPayload((prev) => prev || m.staticQrisPayload);
      const url = await QRCode.toDataURL(m.staticQrisPayload, { width: 220, margin: 1 });
      setQrDataUrl((prev) => prev || url);
    }
  }, [profile, selectedMerchantId]);

  useEffect(() => {
    void loadMerchant();
  }, [loadMerchant]);

  async function generateDynamicQr(isDynamic: boolean) {
    if (!selectedMerchantId) return;
    setError(null);
    try {
      const amt = isDynamic ? parseInt(dynamicAmount.replace(/\D/g, ""), 10) : null;
      const res = await apiFetch<{ rawQrPayload: string }>("/api/v1/merchant/qris", {
        method: "POST",
        body: JSON.stringify({
          merchant_id: selectedMerchantId,
          amount: amt,
          is_dynamic: isDynamic,
        }),
      });
      setGeneratedPayload(res.rawQrPayload);
      const url = await QRCode.toDataURL(res.rawQrPayload, { width: 220, margin: 1 });
      setQrDataUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat QRIS Merchant.");
    }
  }

  async function handleSettle(txAuthToken: string) {
    if (!selectedMerchantId) return;
    setError(null);
    try {
      const tx = await apiFetch<ReceiptTransaction>("/api/v1/merchant/settle", {
        method: "POST",
        idempotencyKey: makeIdempotencyKey("settle"),
        body: JSON.stringify({
          merchant_id: selectedMerchantId,
          amount: parseInt(settleAmount.replace(/\D/g, ""), 10),
          destination_bank: bankName,
          account_number: bankAcc,
          tx_auth_token: txAuthToken,
        }),
      });
      setPinOpen(false);
      setReceipt(tx);
      await loadMerchant();
    } catch (err) {
      setPinOpen(false);
      setError(err instanceof Error ? err.message : "Pencairan instan gagal.");
    }
  }

  const pakBudiDemo = demoUsers.find((u) => u.role === "MERCHANT");
  const activeMerchant =
    dash?.merchants.find((m) => m.id === selectedMerchantId) || dash?.merchants[0] || null;
  const parsedSettle = parseInt(settleAmount.replace(/\D/g, ""), 10) || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">
            SakuKilat Bisnis (Merchant UMKM)
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Penerimaan QRIS instan cair, generator QR dinamis kasir, dan pencairan instan Rp 2.500.
          </p>
        </div>

        {dash && !dash.isOwner && pakBudiDemo && (
          <button
            type="button"
            onClick={() => void switchDemoUser(pakBudiDemo.id)}
            className="sk-btn sk-btn-primary"
          >
            <Store className="w-4 h-4" />
            Beralih ke Akun Pak Budi (Pemilik UMKM)
          </button>
        )}
      </div>

      {dash && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sk-card">
            <p className="text-xs text-[var(--muted)]">Total Kas Merchant Siap Cair</p>
            <p className="text-2xl font-semibold num mt-1">
              {formatRupiah(dash.totalSettlementBalance)}
            </p>
          </div>
          <div className="sk-card">
            <p className="text-xs text-[var(--muted)]">Omzet QRIS Tercatat</p>
            <p className="text-2xl font-semibold num mt-1 text-[var(--positive)]">
              +{formatRupiah(dash.totalQrisGross)}
            </p>
          </div>
          <div className="sk-card">
            <p className="text-xs text-[var(--muted)]">Biaya Pencairan Instan</p>
            <p className="text-2xl font-semibold num mt-1">Rp 2.500</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* QRIS Generator & Instant Settlement */}
        <div className="sk-card lg:col-span-5 space-y-5">
          <div>
            <label htmlFor="merchant-select" className="block text-sm font-medium mb-1">
              Pilih Outlet UMKM
            </label>
            <select
              id="merchant-select"
              value={selectedMerchantId}
              onChange={(e) => setSelectedMerchantId(e.target.value)}
              className="sk-input"
            >
              {dash?.merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.merchantName} ({m.categoryScale}) — {formatRupiah(m.balance)}
                </option>
              ))}
            </select>
          </div>

          <div className="p-4 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-3 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold">
              <QrCode className="w-4 h-4 text-[var(--accent)]" />
              <span>{activeMerchant?.merchantName || "QRIS Merchant"}</span>
            </div>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QRIS Merchant"
                className="w-44 h-44 mx-auto rounded-[10px] border border-[var(--border)] bg-white p-2"
              />
            )}
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={dynamicAmount}
                onChange={(e) => setDynamicAmount(e.target.value.replace(/\D/g, ""))}
                placeholder="Nominal tagihan"
                className="sk-input h-9 text-sm num"
              />
              <button
                type="button"
                onClick={() => void generateDynamicQr(true)}
                className="sk-btn sk-btn-primary min-h-[36px] text-xs"
              >
                QR Dinamis
              </button>
              <button
                type="button"
                onClick={() => void generateDynamicQr(false)}
                className="sk-btn min-h-[36px] text-xs"
              >
                Statis
              </button>
            </div>
            {generatedPayload && (
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(generatedPayload)}
                className="text-xs text-[var(--accent)] font-medium hover:underline"
              >
                Salin Raw String QRIS untuk diuji di halaman Scan QRIS
              </button>
            )}
          </div>

          {/* Instant Settlement */}
          <div className="pt-4 border-t border-[var(--rule)] space-y-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Banknote className="w-4 h-4 text-[var(--accent)]" />
              Pencairan Instan ke Rekening Bank
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Bank (BRI/BCA)"
                className="sk-input h-9 text-sm"
              />
              <input
                type="text"
                value={bankAcc}
                onChange={(e) => setBankAcc(e.target.value)}
                placeholder="No Rekening"
                className="sk-input h-9 text-sm font-mono-id"
              />
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value.replace(/\D/g, ""))}
              className="sk-input num font-semibold"
            />
            <button
              type="button"
              disabled={
                !dash?.isOwner ||
                !activeMerchant ||
                parsedSettle < 10_000 ||
                parsedSettle > activeMerchant.balance
              }
              onClick={() => setPinOpen(true)}
              className="sk-btn sk-btn-dark w-full min-h-[44px]"
            >
              Cairkan Instan ({formatRupiah(parsedSettle)})
            </button>
            {!dash?.isOwner && (
              <p className="text-xs text-[var(--muted)]">
                Beralih ke akun Pak Budi di kanan atas untuk mengeksekusi pencairan merchant.
              </p>
            )}
          </div>
        </div>

        {/* Incoming QRIS Payments Table */}
        <section className="sk-card lg:col-span-7 space-y-4">
          <h2 className="text-[17px] font-semibold">Riwayat Pemasukan QRIS Real-time</h2>
          {!dash || dash.incomingQris.length === 0 ? (
            <div className="border border-dashed border-[var(--control)] rounded-[10px] p-6 text-center text-sm text-[var(--muted)]">
              Belum ada pembayaran QRIS yang masuk ke merchant.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="sk-table">
                <thead>
                  <tr>
                    <th>Outlet / Referensi</th>
                    <th>Status</th>
                    <th className="num">MDR</th>
                    <th className="num">Bruto</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.incomingQris.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <p className="font-medium">{q.title}</p>
                        <p className="text-xs text-[var(--muted)] font-mono-id">
                          {q.referenceNumber} · {formatDateTimeWib(q.createdAt)}
                        </p>
                      </td>
                      <td>
                        <span className="sk-pill sk-pill-pos">{q.status}</span>
                      </td>
                      <td className="num text-[var(--muted)]">{formatRupiah(q.mdrFee)}</td>
                      <td className="num font-semibold text-[var(--positive)]">
                        +{formatRupiah(q.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <PinAuthModal
        open={pinOpen}
        title="Konfirmasi Pencairan Merchant"
        amount={parsedSettle}
        biometricEnabled={profile?.user.biometric_enabled}
        onClose={() => setPinOpen(false)}
        onAuthorized={handleSettle}
      />

      <ReceiptModal tx={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

