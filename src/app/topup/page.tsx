"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Copy, CreditCard, Store, Zap } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import { formatDateTimeWib, formatRupiah } from "@/components/Formatters";

interface TopupOrder {
  id: string;
  channel: string;
  channelLabel: string;
  vaNumber: string;
  amount: number;
  adminFee: number;
  status: string;
  externalRef: string;
  failureReason: string | null;
  createdAt: string;
}

interface WalletsSummary {
  mainBalance: number;
  totalBalance: number;
  balanceLimit: number;
  kycStatus: string;
  topupOrders: TopupOrder[];
}

const CHANNELS = [
  { id: "VA_BCA", name: "BCA Virtual Account", fee: 0, group: "VA" },
  { id: "VA_MANDIRI", name: "Mandiri Virtual Account", fee: 0, group: "VA" },
  { id: "VA_BNI", name: "BNI Virtual Account", fee: 0, group: "VA" },
  { id: "VA_BRI", name: "BRI Virtual Account", fee: 0, group: "VA" },
  { id: "VA_BSI", name: "BSI Virtual Account", fee: 0, group: "VA" },
  { id: "RETAIL_ALFAMART", name: "Gerai Alfamart", fee: 2500, group: "RETAIL" },
  { id: "RETAIL_INDOMARET", name: "Gerai Indomaret", fee: 2500, group: "RETAIL" },
  { id: "DEBIT_INSTANT", name: "Kartu Debit Instan", fee: 1000, group: "DEBIT" },
];

export default function TopupPage() {
  const { profile, refreshSession } = useSession();
  const [summary, setSummary] = useState<WalletsSummary | null>(null);
  const [channel, setChannel] = useState("VA_BCA");
  const [amount, setAmount] = useState("250000");
  const [activeOrder, setActiveOrder] = useState<TopupOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [simBusyRef, setSimBusyRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!profile) return;
    const data = await apiFetch<WalletsSummary>("/api/v1/wallets");
    setSummary(data);
  }, [profile]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const parsedAmount = parseInt(amount.replace(/\D/g, ""), 10);
      const order = await apiFetch<TopupOrder>("/api/v1/topups", {
        method: "POST",
        body: JSON.stringify({ channel, amount: parsedAmount }),
      });
      setActiveOrder(order);
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat instruksi Top Up.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSimulateBankWebhook(externalRef: string) {
    setSimBusyRef(externalRef);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch<{
        status: string;
        hmacTrace?: { signaturePrefix: string };
      }>("/api/v1/sandbox/trigger-va", {
        method: "POST",
        body: JSON.stringify({ external_ref: externalRef }),
      });
      setSuccessMsg(
        `Webhook bank terverifikasi HMAC-SHA256 (${res.hmacTrace?.signaturePrefix || "ok"}). Saldo Utama bertambah!`
      );
      setActiveOrder(null);
      await loadSummary();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulasi webhook gagal.");
      await loadSummary();
    } finally {
      setSimBusyRef(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">
          Isi Saldo (Top Up)
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Virtual Account bank nasional, gerai ritel, dan kartu debit dengan kredit otomatis
          via webhook terverifikasi HMAC.
        </p>
      </div>

      {summary && (
        <div className="sk-card flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--muted)]">Total Saldo Saat Ini</p>
            <p className="text-2xl font-semibold num mt-0.5">
              {formatRupiah(summary.totalBalance)}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs text-[var(--muted)]">
              Sisa Kuota Batas Saldo ({summary.kycStatus})
            </p>
            <p className="text-base font-semibold num mt-0.5 text-[var(--accent)]">
              {formatRupiah(Math.max(0, summary.balanceLimit - summary.totalBalance))}{" "}
              <span className="text-xs font-normal text-[var(--muted)]">
                dari {formatRupiah(summary.balanceLimit)}
              </span>
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form onSubmit={handleCreateOrder} className="sk-card lg:col-span-7 space-y-5">
          <div>
            <h2 className="text-[17px] font-semibold mb-3">1. Pilih Metode Isi Saldo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {CHANNELS.map((c) => {
                const selected = channel === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChannel(c.id)}
                    className={`p-3 rounded-[10px] border text-left flex items-center justify-between gap-2 transition-colors ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {c.group === "VA" ? (
                        <Building2 className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
                      ) : c.group === "RETAIL" ? (
                        <Store className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
                      ) : (
                        <CreditCard className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">{c.name}</span>
                    </div>
                    <span className="text-xs text-[var(--muted)] num shrink-0">
                      {c.fee === 0 ? "Gratis" : formatRupiah(c.fee)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="topup-amount" className="block text-sm font-medium mb-2">
              2. Nominal Top Up (Minimal Rp 10.000)
            </label>
            <input
              id="topup-amount"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              className="sk-input text-lg font-semibold num"
              required
            />
            <div className="mt-2.5 flex flex-wrap gap-2">
              {[50_000, 100_000, 250_000, 500_000, 1_000_000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className="px-3 h-8 rounded-[8px] border border-[var(--border)] bg-[var(--ground)] hover:bg-[var(--accent-soft)] text-xs font-medium num"
                >
                  {formatRupiah(preset)}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" disabled={busy} className="sk-btn sk-btn-primary w-full min-h-[44px]">
            {busy ? "Membuat Nomor Pembayaran..." : "Buat Instruksi Pembayaran"}
          </button>
        </form>

        <div className="sk-card lg:col-span-5 space-y-4">
          <h2 className="text-[17px] font-semibold">Instruksi &amp; Simulator Webhook Bank</h2>

          {activeOrder ? (
            <div className="p-4 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--muted)]">
                  {activeOrder.channelLabel}
                </span>
                <span className="sk-pill sk-pill-warn">{activeOrder.status}</span>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Nomor Virtual Account / Kode Bayar</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-lg font-semibold font-mono-id tracking-wider">
                    {activeOrder.vaNumber}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(activeOrder.vaNumber)}
                    className="sk-btn min-h-[32px] px-2.5 text-xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Salin
                  </button>
                </div>
              </div>
              <div className="pt-2 border-t border-[var(--border)] flex justify-between text-sm">
                <span className="text-[var(--muted)]">Nominal Kredit</span>
                <span className="font-semibold num">{formatRupiah(activeOrder.amount)}</span>
              </div>
              <button
                type="button"
                disabled={simBusyRef === activeOrder.externalRef}
                onClick={() => void handleSimulateBankWebhook(activeOrder.externalRef)}
                className="sk-btn sk-btn-dark w-full min-h-[44px]"
              >
                <Zap className="w-4 h-4" />
                {simBusyRef === activeOrder.externalRef
                  ? "Mengirim Webhook HMAC..."
                  : "Simulasi Pembayaran Bank (Trigger Webhook)"}
              </button>
            </div>
          ) : (
            <div className="border border-dashed border-[var(--control)] rounded-[10px] p-5 text-sm text-[var(--muted)] text-center">
              Buat instruksi Top Up di sebelah kiri untuk mendapatkan nomor VA unik dan
              menjalankan simulasi webhook bank.
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2">Riwayat Permintaan Top Up</h3>
            <div className="divide-y divide-[var(--rule)]">
              {!summary || summary.topupOrders.length === 0 ? (
                <p className="py-4 text-xs text-[var(--muted)] text-center">
                  Belum ada order Top Up.
                </p>
              ) : (
                summary.topupOrders.slice(0, 5).map((o) => (
                  <div key={o.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{o.channelLabel}</p>
                      <p className="text-[11px] text-[var(--muted)] font-mono-id">
                        {o.vaNumber} · {formatDateTimeWib(o.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold num">{formatRupiah(o.amount)}</span>
                      {o.status === "PENDING" ? (
                        <button
                          type="button"
                          disabled={simBusyRef === o.externalRef}
                          onClick={() => void handleSimulateBankWebhook(o.externalRef)}
                          className="sk-btn min-h-[30px] px-2.5 text-xs sk-btn-primary"
                        >
                          Bayar
                        </button>
                      ) : (
                        <span
                          className={`sk-pill ${
                            o.status === "PAID" ? "sk-pill-pos" : "sk-pill-neg"
                          }`}
                        >
                          {o.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

