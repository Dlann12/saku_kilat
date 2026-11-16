"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import {
  formatDateTimeWib,
  formatRupiah,
  formatSignedRupiah,
} from "@/components/Formatters";
import { CategoryBreakdownList, SpendingBarChart } from "@/components/Charts";
import { ReceiptModal, type ReceiptTransaction } from "@/components/ReceiptModal";

interface TxRow extends ReceiptTransaction {
  direction: "IN" | "OUT" | "INTERNAL";
}

interface AnalyticsSummary {
  totalIn: number;
  totalOut: number;
  netFlow: number;
  transactionCount: number;
  categories: Array<{ category: string; amount: number; sharePercent: number }>;
  dailySeries: Array<{ label: string; dateIso: string; outAmount: number; inAmount: number }>;
}

export default function RiwayatPage() {
  const { profile } = useSession();
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  const [direction, setDirection] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [txType, setTxType] = useState("ALL");
  const [search, setSearch] = useState("");
  const [chartMode, setChartMode] = useState<"OUT" | "IN">("OUT");

  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<ReceiptTransaction | null>(null);

  const loadHistory = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("direction", direction);
      params.set("type", txType);
      if (search.trim()) params.set("q", search.trim());

      const [tRes, aRes] = await Promise.all([
        apiFetch<{ transactions: TxRow[] }>(`/api/v1/transactions?${params.toString()}`),
        apiFetch<AnalyticsSummary>("/api/v1/analytics/summary"),
      ]);
      setTransactions(tRes.transactions);
      setAnalytics(aRes);
    } finally {
      setLoading(false);
    }
  }, [profile, direction, txType, search]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function exportCsv() {
    const header = "Referensi,Waktu,Judul,Kategori,Jenis,Status,Arah,Nominal,Admin,Total";
    const rows = transactions.map((t) =>
      [
        t.referenceNumber,
        t.createdAt,
        `"${t.title.replace(/"/g, '""')}"`,
        `"${t.category}"`,
        t.transactionType,
        t.status,
        t.direction,
        t.amount,
        t.adminFee,
        t.totalAmount,
      ].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mutasi-sakukilat-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">
            Riwayat &amp; Laporan Keuangan
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Mutasi rekening real-time, ringkasan pengeluaran kategori, dan bukti resi digital.
          </p>
        </div>
        <button type="button" onClick={exportCsv} className="sk-btn">
          <Download className="w-4 h-4" />
          Ekspor CSV
        </button>
      </div>

      {/* Analytics Summary + Charts */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="sk-card lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold">Arus Kas 7 Hari Terakhir</h2>
                <p className="text-xs text-[var(--muted)] num mt-0.5">
                  Masuk{" "}
                  <span className="font-semibold text-[var(--positive)]">
                    +{formatRupiah(analytics.totalIn)}
                  </span>{" "}
                  · Keluar{" "}
                  <span className="font-semibold text-[var(--text)]">
                    -{formatRupiah(analytics.totalOut)}
                  </span>
                </p>
              </div>
              <div className="inline-flex p-0.5 rounded-[8px] bg-[var(--ground)] border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setChartMode("OUT")}
                  className={`px-3 h-7 rounded-[6px] text-xs font-medium ${
                    chartMode === "OUT"
                      ? "bg-[var(--surface)] text-[var(--text)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  Pengeluaran
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("IN")}
                  className={`px-3 h-7 rounded-[6px] text-xs font-medium ${
                    chartMode === "IN"
                      ? "bg-[var(--surface)] text-[var(--text)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  Pemasukan
                </button>
              </div>
            </div>

            <SpendingBarChart data={analytics.dailySeries} mode={chartMode} />
          </div>

          <div className="sk-card lg:col-span-5 space-y-4">
            <div>
              <h2 className="text-[17px] font-semibold">Persentase Pengeluaran</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Dihitung langsung dari catatan buku besar terverifikasi
              </p>
            </div>
            <CategoryBreakdownList
              categories={analytics.categories}
              totalOut={analytics.totalOut}
            />
          </div>
        </div>
      )}

      {/* Filters & Mutasi Table */}
      <section className="sk-card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center flex-1 min-w-[200px] h-10 px-3 border border-[var(--control)] rounded-[10px] bg-[var(--surface)] focus-within:outline-2 focus-within:outline-[var(--accent)]">
            <Search className="w-4 h-4 text-[var(--muted)] mr-2.5 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari merchant, nomor referensi, atau kategori..."
              className="w-full bg-transparent border-0 outline-none text-[15px] text-[var(--text)] placeholder:text-[var(--faint)]"
            />
          </div>

          <select
            aria-label="Filter arah transaksi"
            value={direction}
            onChange={(e) => setDirection(e.target.value as "ALL" | "IN" | "OUT")}
            className="sk-input w-auto min-w-[140px]"
          >
            <option value="ALL">Semua Arus</option>
            <option value="IN">Dana Masuk (+)</option>
            <option value="OUT">Dana Keluar (-)</option>
          </select>

          <select
            aria-label="Filter jenis transaksi"
            value={txType}
            onChange={(e) => setTxType(e.target.value)}
            className="sk-input w-auto min-w-[160px]"
          >
            <option value="ALL">Semua Jenis</option>
            <option value="QRIS">QRIS</option>
            <option value="TOPUP">Top Up</option>
            <option value="TRANSFER_P2P">Transfer P2P</option>
            <option value="TRANSFER_BANK">Transfer Bank</option>
            <option value="PPOB">PPOB</option>
            <option value="POCKET_MOVE">Pindah Kantong</option>
            <option value="SPLIT_BILL">Patungan</option>
          </select>
        </div>

        {loading ? (
          <div className="h-40 rounded-[10px] bg-[var(--ground)]" />
        ) : transactions.length === 0 ? (
          <div className="border border-dashed border-[var(--control)] rounded-[10px] p-8 text-center text-sm text-[var(--muted)]">
            Tidak ada mutasi yang sesuai dengan filter saat ini.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="sk-table">
                <thead>
                  <tr>
                    <th>Transaksi</th>
                    <th>Kategori</th>
                    <th>Referensi</th>
                    <th>Status</th>
                    <th className="num">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className="cursor-pointer hover:bg-[var(--raised)] transition-colors"
                    >
                      <td>
                        <p className="font-medium text-[var(--text)]">{tx.title}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {formatDateTimeWib(tx.createdAt)} WIB
                        </p>
                      </td>
                      <td className="text-[var(--muted)]">{tx.category}</td>
                      <td className="font-mono-id text-xs text-[var(--muted)]">
                        {tx.referenceNumber}
                      </td>
                      <td>
                        <span
                          className={`sk-pill ${
                            tx.status === "SUCCESS"
                              ? "sk-pill-pos"
                              : tx.status === "REVERSED"
                              ? "sk-pill-warn"
                              : "sk-pill-neg"
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td
                        className={`num font-semibold ${
                          tx.direction === "IN" ? "text-[var(--positive)]" : "text-[var(--text)]"
                        }`}
                      >
                        {formatSignedRupiah(
                          tx.direction === "OUT" ? tx.totalAmount : tx.amount,
                          tx.direction
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile 2-line rows (<640px) */}
            <div className="sm:hidden divide-y divide-[var(--rule)]">
              {transactions.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => setSelectedTx(tx)}
                  className="w-full py-3 text-left flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{tx.title}</p>
                    <p className="text-xs text-[var(--muted)] truncate">
                      {tx.category} · {formatDateTimeWib(tx.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-semibold num ${
                        tx.direction === "IN" ? "text-[var(--positive)]" : "text-[var(--text)]"
                      }`}
                    >
                      {formatSignedRupiah(
                        tx.direction === "OUT" ? tx.totalAmount : tx.amount,
                        tx.direction
                      )}
                    </p>
                    <span className="text-[11px] font-mono-id text-[var(--faint)]">
                      {tx.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <ReceiptModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
    </div>
  );
}
