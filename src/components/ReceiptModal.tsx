"use client";

import React, { useState } from "react";
import { CheckCircle2, Copy, Download, RotateCcw, X } from "lucide-react";
import { formatDateTimeWib, formatRupiah } from "./Formatters";

export interface ReceiptTransaction {
  id: string;
  referenceNumber: string;
  transactionType: string;
  status: string;
  amount: number;
  adminFee: number;
  totalAmount: number;
  title: string;
  category: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export function ReceiptModal({
  tx,
  onClose,
}: {
  tx: ReceiptTransaction | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!tx) return null;

  const isReversed = tx.status === "REVERSED";
  const tokenNumber = tx.metadata?.tokenNumber ? String(tx.metadata.tokenNumber) : null;
  const sourceWalletName = tx.metadata?.sourceWalletName
    ? String(tx.metadata.sourceWalletName)
    : null;

  function handleCopy() {
    if (!tx) return;
    const summary = [
      "=== RESI DIGITAL SAKUKILAT ===",
      `Ref: ${tx.referenceNumber}`,
      `Transaksi: ${tx.title}`,
      `Status: ${tx.status}`,
      `Nominal: ${formatRupiah(tx.amount)}`,
      `Biaya Admin: ${formatRupiah(tx.adminFee)}`,
      `Total: ${formatRupiah(tx.totalAmount)}`,
      tokenNumber ? `Kode/Token: ${tokenNumber}` : null,
      `Waktu: ${formatDateTimeWib(tx.createdAt)} WIB`,
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard?.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadReceipt() {
    if (!tx) return;
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="440" height="360" viewBox="0 0 440 360">
  <rect width="440" height="360" fill="#F3F5F7" />
  <rect x="20" y="20" width="400" height="320" rx="16" fill="#FFFFFF" stroke="#E6E6E6" />
  <text x="40" y="56" font-family="sans-serif" font-size="18" font-weight="600" fill="#1D5FD6">SakuKilat — Resi Digital</text>
  <text x="40" y="80" font-family="sans-serif" font-size="13" fill="#5C6064">${tx.referenceNumber}</text>
  <line x1="40" y1="98" x2="400" y2="98" stroke="#E6E6E6" />
  <text x="40" y="130" font-family="sans-serif" font-size="15" font-weight="600" fill="#1B1D1F">${tx.title.replace(/&/g, "&amp;")}</text>
  <text x="40" y="156" font-family="sans-serif" font-size="13" fill="#5C6064">Kategori: ${tx.category} | Status: ${tx.status}</text>
  <text x="40" y="196" font-family="sans-serif" font-size="13" fill="#5C6064">Nominal Transaksi</text>
  <text x="400" y="196" text-anchor="end" font-family="sans-serif" font-size="14" font-weight="600" fill="#1B1D1F">${formatRupiah(tx.amount)}</text>
  <text x="40" y="224" font-family="sans-serif" font-size="13" fill="#5C6064">Biaya Admin</text>
  <text x="400" y="224" text-anchor="end" font-family="sans-serif" font-size="14" fill="#1B1D1F">${formatRupiah(tx.adminFee)}</text>
  <line x1="40" y1="244" x2="400" y2="244" stroke="#E6E6E6" />
  <text x="40" y="274" font-family="sans-serif" font-size="14" font-weight="600" fill="#1B1D1F">Total Bayar</text>
  <text x="400" y="274" text-anchor="end" font-family="sans-serif" font-size="18" font-weight="600" fill="#1D5FD6">${formatRupiah(tx.totalAmount)}</text>
  <text x="40" y="316" font-family="sans-serif" font-size="12" fill="#6B6B6B">${formatDateTimeWib(tx.createdAt)} WIB</text>
</svg>`;
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resi-${tx.referenceNumber}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div
        className="w-full sm:max-w-[440px] bg-[var(--surface)] border border-[var(--border)] rounded-t-[20px] sm:rounded-[20px] p-6"
        style={{ boxShadow: "0 12px 32px rgba(27,29,31,0.14)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-[10px] flex items-center justify-center ${
                isReversed
                  ? "bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)]"
                  : "bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]"
              }`}
            >
              {isReversed ? (
                <RotateCcw className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 id="receipt-modal-title" className="text-[17px] font-semibold">
                {isReversed ? "Transaksi Dikembalikan" : "Transaksi Berhasil"}
              </h2>
              <p className="text-xs text-[var(--muted)]">{formatDateTimeWib(tx.createdAt)} WIB</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--muted)] hover:bg-[var(--raised)]"
            aria-label="Tutup resi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 p-4 rounded-[12px] bg-[var(--ground)] border border-[var(--border)]">
          <p className="text-xs text-[var(--muted)]">{tx.category}</p>
          <p className="text-base font-semibold text-[var(--text)] mt-0.5">{tx.title}</p>
          <p className="text-2xl font-semibold text-[var(--text)] num mt-2">
            {formatRupiah(tx.totalAmount)}
          </p>
        </div>

        {tokenNumber && (
          <div className="mt-3 p-3.5 rounded-[10px] bg-[var(--accent-soft)] border border-[#bfe1ff]">
            <p className="text-xs font-medium text-[var(--accent-ink)]">
              Nomor Token / Voucher Digital
            </p>
            <p className="mt-1 text-base font-semibold text-[var(--accent-ink)] font-mono-id tracking-wider">
              {tokenNumber}
            </p>
          </div>
        )}

        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Nomor Referensi</dt>
            <dd className="font-mono-id text-xs font-medium text-[var(--text)]">
              {tx.referenceNumber}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Status</dt>
            <dd>
              <span className={`sk-pill ${isReversed ? "sk-pill-warn" : "sk-pill-pos"}`}>
                {tx.status}
              </span>
            </dd>
          </div>
          {sourceWalletName && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Sumber Dana</dt>
              <dd className="font-medium">{sourceWalletName}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Nominal Transaksi</dt>
            <dd className="num font-medium">{formatRupiah(tx.amount)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Biaya Admin</dt>
            <dd className="num font-medium">{formatRupiah(tx.adminFee)}</dd>
          </div>
          <div className="pt-2.5 border-t border-[var(--rule)] flex justify-between gap-4 font-semibold">
            <dt>Total Dibayarkan</dt>
            <dd className="num text-[var(--accent)]">{formatRupiah(tx.totalAmount)}</dd>
          </div>
        </dl>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={handleCopy} className="sk-btn">
            <Copy className="w-4 h-4" />
            {copied ? "Tersalin" : "Salin Resi"}
          </button>
          <button type="button" onClick={handleDownloadReceipt} className="sk-btn sk-btn-primary">
            <Download className="w-4 h-4" />
            Unduh Resi
          </button>
        </div>
      </div>
    </div>
  );
}

