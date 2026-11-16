"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import { formatDateTimeWib, formatRupiah } from "@/components/Formatters";

interface AdminOverview {
  ledgerInvariant: {
    balanced: boolean;
    totalDebit: number;
    totalCredit: number;
    discrepancy: number;
    totalEntries: number;
  };
  systemWallets: Array<{ walletType: string; name: string; balance: number }>;
  kycQueue: Array<{
    id: string;
    userId: string;
    phoneNumber: string;
    fullNameKtp: string;
    status: string;
    livenessScore: number;
    rejectionReason: string | null;
    createdAt: string;
  }>;
  outboxEvents: Array<{
    id: string;
    topic: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    status: string;
    createdAt: string;
  }>;
  recentLedgerEntries: Array<{
    id: string;
    referenceNumber: string;
    walletName: string;
    entryType: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    description: string;
  }>;
  recentTransactions: Array<{
    id: string;
    referenceNumber: string;
    transactionType: string;
    status: string;
    amount: number;
    adminFee: number;
    title: string;
    userName: string;
    createdAt: string;
  }>;
}

export default function AdminPage() {
  const { profile, demoUsers, switchDemoUser } = useSession();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!profile) return;
    const res = await apiFetch<AdminOverview>("/api/v1/admin/overview");
    setData(res);
  }, [profile]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function handleReviewKyc(docId: string, decision: "VERIFIED" | "REJECTED") {
    setBusyId(docId);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/admin/kyc/${docId}/review`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          rejection_reason:
            decision === "REJECTED" ? "Foto e-KTP kurang terbaca, mohon unggah ulang." : undefined,
        }),
      });
      setNotice(`Status KYC berhasil diperbarui menjadi ${decision}.`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses review KYC.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReverseTx(txId: string) {
    setBusyId(txId);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/admin/transactions/${txId}/reverse`, {
        method: "POST",
        body: JSON.stringify({ reason: "Simulasi Auto-Reversal Rekonsiliasi" }),
      });
      setNotice("Transaksi berhasil di-reverse dan saldo dikembalikan atomik.");
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-reversal gagal.");
    } finally {
      setBusyId(null);
    }
  }

  const adminUser = demoUsers.find((u) => u.role === "ADMIN");
  const isAdmin = profile?.user.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">
            Admin Compliance &amp; Audit Double-Entry Ledger
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Bukti keseimbangan akuntansi (DEBIT = CREDIT), antrean KYC e-KTP, outbox event stream,
            dan simulasi auto-reversal.
          </p>
        </div>

        {!isAdmin && adminUser && (
          <button
            type="button"
            onClick={() => void switchDemoUser(adminUser.id)}
            className="sk-btn sk-btn-primary"
          >
            <ShieldCheck className="w-4 h-4" />
            Masuk sebagai Nadia Putri (Compliance Admin)
          </button>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm">
          {notice}
        </div>
      )}

      {data && (
        <>
          {/* Global Ledger Reconciliation Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="sk-card">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[var(--muted)]">Status Buku Besar</p>
                <span
                  className={`sk-pill ${
                    data.ledgerInvariant.balanced ? "sk-pill-pos" : "sk-pill-neg"
                  }`}
                >
                  {data.ledgerInvariant.balanced ? "SEIMBANG (0 SELISIH)" : "TIMPANG"}
                </span>
              </div>
              <p className="text-xl font-semibold num mt-2">
                {data.ledgerInvariant.totalEntries} baris entri
              </p>
              <p className="text-xs text-[var(--muted)] num mt-1">
                Total Debit = Kredit: {formatRupiah(data.ledgerInvariant.totalDebit)}
              </p>
            </div>

            {data.systemWallets
              .filter((w) => w.walletType === "SYSTEM_ESCROW" || w.walletType === "SYSTEM_FEE")
              .map((sw) => (
                <div key={sw.walletType} className="sk-card">
                  <p className="text-xs text-[var(--muted)]">{sw.name}</p>
                  <p className="text-2xl font-semibold num mt-1">{formatRupiah(sw.balance)}</p>
                  <p className="text-[11px] font-mono-id text-[var(--faint)] mt-1">
                    {sw.walletType}
                  </p>
                </div>
              ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* KYC Review Queue */}
            <section className="sk-card lg:col-span-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-semibold">Antrean Verifikasi KYC</h2>
                <span className="text-xs text-[var(--muted)]">
                  {isAdmin ? "Hak akses Admin aktif" : "Mode baca (butuh Admin)"}
                </span>
              </div>

              <div className="divide-y divide-[var(--rule)]">
                {data.kycQueue.map((k) => (
                  <div
                    key={k.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold">{k.fullNameKtp}</p>
                      <p className="text-xs text-[var(--muted)] font-mono-id">
                        {k.phoneNumber} · Liveness {k.livenessScore}%
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`sk-pill ${
                          k.status === "VERIFIED"
                            ? "sk-pill-pos"
                            : k.status === "PENDING"
                            ? "sk-pill-warn"
                            : "sk-pill-neg"
                        }`}
                      >
                        {k.status}
                      </span>
                      {k.status === "PENDING" && isAdmin && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === k.id}
                            onClick={() => void handleReviewKyc(k.id, "VERIFIED")}
                            className="sk-btn min-h-[30px] px-2.5 text-xs sk-btn-primary"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Setujui
                          </button>
                          <button
                            type="button"
                            disabled={busyId === k.id}
                            onClick={() => void handleReviewKyc(k.id, "REJECTED")}
                            className="sk-btn min-h-[30px] px-2.5 text-xs"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Tolak
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Outbox / Kafka Stream */}
            <section className="sk-card lg:col-span-6 space-y-3">
              <h2 className="text-[17px] font-semibold">Event Outbox (Audit Stream)</h2>
              <div className="divide-y divide-[var(--rule)] max-h-[340px] overflow-y-auto">
                {data.outboxEvents.slice(0, 8).map((ev) => (
                  <div key={ev.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold font-mono-id truncate">{ev.topic}</p>
                      <p className="text-[11px] text-[var(--muted)] truncate">
                        Ref: {String(ev.payload.referenceNumber || ev.aggregateId)} ·{" "}
                        {formatDateTimeWib(ev.createdAt)}
                      </p>
                    </div>
                    <span className="sk-pill sk-pill-pos">{ev.status}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Transaction Auto-Reversal & Double-Entry Ledger Entries */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="sk-card lg:col-span-5 space-y-3">
              <h2 className="text-[17px] font-semibold">Simulasi Auto-Reversal Transaksi</h2>
              <div className="divide-y divide-[var(--rule)]">
                {data.recentTransactions.slice(0, 8).map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{t.title}</p>
                      <p className="text-[11px] text-[var(--muted)] font-mono-id">
                        {t.userName} · {formatRupiah(t.amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`sk-pill ${
                          t.status === "SUCCESS" ? "sk-pill-pos" : "sk-pill-warn"
                        }`}
                      >
                        {t.status}
                      </span>
                      {t.status === "SUCCESS" && isAdmin && (
                        <button
                          type="button"
                          disabled={busyId === t.id}
                          onClick={() => void handleReverseTx(t.id)}
                          className="sk-btn min-h-[28px] px-2 text-[11px]"
                        >
                          <RotateCcw className="w-3 h-3" /> Reverse
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="sk-card lg:col-span-7 space-y-3">
              <h2 className="text-[17px] font-semibold">Buku Besar Double-Entry Terbaru</h2>
              <div className="overflow-x-auto">
                <table className="sk-table">
                  <thead>
                    <tr>
                      <th>Dompet / Ref</th>
                      <th>Tipe</th>
                      <th className="num">Nominal</th>
                      <th className="num">Saldo Akhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentLedgerEntries.slice(0, 10).map((e) => (
                      <tr key={e.id}>
                        <td>
                          <p className="text-xs font-medium">{e.walletName}</p>
                          <p className="text-[11px] text-[var(--muted)] font-mono-id">
                            {e.referenceNumber}
                          </p>
                        </td>
                        <td>
                          <span
                            className={`sk-pill ${
                              e.entryType === "CREDIT" ? "sk-pill-pos" : "sk-pill-neutral"
                            }`}
                          >
                            {e.entryType}
                          </span>
                        </td>
                        <td className="num text-xs font-semibold">{formatRupiah(e.amount)}</td>
                        <td className="num text-xs text-[var(--muted)]">
                          {formatRupiah(e.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
