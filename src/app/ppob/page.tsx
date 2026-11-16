"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Zap } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import { formatRupiah, makeIdempotencyKey } from "@/components/Formatters";
import { PinAuthModal } from "@/components/PinAuthModal";
import { ReceiptModal, type ReceiptTransaction } from "@/components/ReceiptModal";

interface PpobProduct {
  code: string;
  category: string;
  name: string;
  provider: string;
  basePrice: number;
  adminFee: number;
  description: string;
}

interface WalletItem {
  id: string;
  walletType: string;
  name: string;
  balance: number;
  isLocked: boolean;
}

interface InquiryResult {
  product: PpobProduct;
  customerNumber: string;
  customerName: string;
  period: string;
  basePrice: number;
  adminFee: number;
  totalPayable: number;
}

const CATEGORIES = [
  { key: "ALL", label: "Semua" },
  { key: "PULSA", label: "Pulsa" },
  { key: "DATA", label: "Paket Data" },
  { key: "PLN_TOKEN", label: "Token PLN" },
  { key: "PLN_BILL", label: "Tagihan PLN" },
  { key: "BPJS", label: "BPJS" },
  { key: "PDAM", label: "PDAM" },
  { key: "GAME", label: "Voucher Game" },
];

export default function PpobPage() {
  const { profile } = useSession();
  const [products, setProducts] = useState<PpobProduct[]>([]);
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [catFilter, setCatFilter] = useState("ALL");
  const [selectedCode, setSelectedCode] = useState("");
  const [customerNo, setCustomerNo] = useState("54120987654");
  const [sourceWalletId, setSourceWalletId] = useState("");
  const [inquiry, setInquiry] = useState<InquiryResult | null>(null);

  const [pinOpen, setPinOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInit = useCallback(async () => {
    const catRes = await apiFetch<{ products: PpobProduct[] }>("/api/v1/ppob/catalog");
    setProducts(catRes.products);
    if (catRes.products.length > 0) {
      setSelectedCode((prev) => prev || catRes.products[0].code);
    }
    if (profile) {
      const wRes = await apiFetch<{ wallets: WalletItem[] }>("/api/v1/wallets");
      const usable = wRes.wallets.filter(
        (w) => w.walletType === "MAIN" || w.walletType === "POCKET"
      );
      setWallets(usable);
      if (usable.length > 0) setSourceWalletId((prev) => prev || usable[0].id);
    }
  }, [profile]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cat = new URLSearchParams(window.location.search).get("cat");
      if (cat && CATEGORIES.some((c) => c.key === cat)) {
        setCatFilter(cat);
      }
    }
    void loadInit();
  }, [loadInit]);

  async function handleInquire(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<InquiryResult>("/api/v1/ppob/inquire", {
        method: "POST",
        body: JSON.stringify({
          product_code: selectedCode,
          customer_number: customerNo,
        }),
      });
      setInquiry(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memeriksa tagihan/pelanggan.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExecute(txAuthToken: string) {
    if (!inquiry) return;
    setError(null);
    try {
      const tx = await apiFetch<ReceiptTransaction>("/api/v1/ppob/execute", {
        method: "POST",
        idempotencyKey: makeIdempotencyKey("ppob"),
        body: JSON.stringify({
          product_code: inquiry.product.code,
          customer_number: inquiry.customerNumber,
          source_wallet_id: sourceWalletId,
          tx_auth_token: txAuthToken,
        }),
      });
      setPinOpen(false);
      setInquiry(null);
      setReceipt(tx);
      await loadInit();
    } catch (err) {
      setPinOpen(false);
      setError(err instanceof Error ? err.message : "Transaksi PPOB gagal.");
    }
  }

  const filtered =
    catFilter === "ALL" ? products : products.filter((p) => p.category === catFilter);
  const selectedWallet = wallets.find((w) => w.id === sourceWalletId) || null;
  const insufficient = Boolean(
    inquiry && selectedWallet && inquiry.totalPayable > selectedWallet.balance
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">
          Bayar &amp; Beli Produk Digital (PPOB)
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Pulsa, paket data, token &amp; tagihan listrik PLN, PDAM, BPJS Kesehatan, dan voucher
          game dengan kode token instan di resi.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCatFilter(c.key)}
            className={`px-3.5 h-9 rounded-full text-xs font-medium border transition-colors ${
              catFilter === c.key
                ? "bg-[var(--accent)] text-white border-transparent"
                : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="sk-card lg:col-span-7 space-y-3">
          <h2 className="text-[17px] font-semibold">Pilih Produk Digital</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filtered.map((p) => {
              const active = selectedCode === p.code;
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => {
                    setSelectedCode(p.code);
                    setInquiry(null);
                  }}
                  className={`p-3.5 rounded-[12px] border text-left transition-colors ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <span className="sk-pill sk-pill-neutral">{p.provider}</span>
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-1">{p.description}</p>
                  <p className="text-sm font-semibold num text-[var(--accent-ink)] mt-2">
                    {formatRupiah(p.basePrice)}{" "}
                    <span className="text-[11px] font-normal text-[var(--muted)]">
                      + admin {formatRupiah(p.adminFee)}
                    </span>
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sk-card lg:col-span-5 space-y-4">
          <h2 className="text-[17px] font-semibold">Cek Tagihan &amp; Bayar</h2>
          <form onSubmit={handleInquire} className="space-y-3.5">
            <div>
              <label htmlFor="ppob-cust" className="block text-sm font-medium mb-1">
                Nomor HP / ID Pelanggan / User ID
              </label>
              <input
                id="ppob-cust"
                type="text"
                value={customerNo}
                onChange={(e) => {
                  setCustomerNo(e.target.value);
                  setInquiry(null);
                }}
                placeholder="085211223344 atau 54120987654"
                className="sk-input font-mono-id"
                required
              />
            </div>

            <div>
              <label htmlFor="ppob-wallet" className="block text-sm font-medium mb-1">
                Sumber Dana
              </label>
              <select
                id="ppob-wallet"
                value={sourceWalletId}
                onChange={(e) => setSourceWalletId(e.target.value)}
                className="sk-input"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {formatRupiah(w.balance)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={busy || !selectedCode}
              className="sk-btn sk-btn-dark w-full"
            >
              <Zap className="w-4 h-4" />
              {busy ? "Mengecek Biller..." : "Cek Harga & Tagihan"}
            </button>
          </form>

          {inquiry && (
            <div className="p-4 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-2.5 text-sm">
              <div className="flex items-center gap-2 font-semibold text-[var(--positive)]">
                <CheckCircle2 className="w-4 h-4" />
                Tagihan / Produk Siap Dibayar
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Produk</span>
                <span className="font-medium text-right">{inquiry.product.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">ID / Pelanggan</span>
                <span className="font-mono-id text-xs">{inquiry.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Harga Pokok</span>
                <span className="num">{formatRupiah(inquiry.basePrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Biaya Admin</span>
                <span className="num">{formatRupiah(inquiry.adminFee)}</span>
              </div>
              <div className="pt-2 border-t border-[var(--border)] flex justify-between font-semibold">
                <span>Total Bayar</span>
                <span className="num text-[var(--accent)]">
                  {formatRupiah(inquiry.totalPayable)}
                </span>
              </div>

              {insufficient && (
                <p className="text-xs text-[var(--negative)]">
                  Saldo sumber dana tidak mencukupi.
                </p>
              )}

              <button
                type="button"
                disabled={insufficient || Boolean(selectedWallet?.isLocked)}
                onClick={() => setPinOpen(true)}
                className="sk-btn sk-btn-primary w-full min-h-[44px] mt-2"
              >
                Bayar Sekarang (PIN)
              </button>
            </div>
          )}
        </div>
      </div>

      <PinAuthModal
        open={pinOpen}
        title="Otorisasi Pembayaran PPOB"
        amount={inquiry?.totalPayable}
        biometricEnabled={profile?.user.biometric_enabled}
        onClose={() => setPinOpen(false)}
        onAuthorized={handleExecute}
      />

      <ReceiptModal tx={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
