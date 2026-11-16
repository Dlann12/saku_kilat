"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Search, Send, ShieldAlert, UserCheck } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import { formatRupiah, makeIdempotencyKey } from "@/components/Formatters";
import { PinAuthModal } from "@/components/PinAuthModal";
import { ReceiptModal, type ReceiptTransaction } from "@/components/ReceiptModal";

interface WalletItem {
  id: string;
  walletType: string;
  name: string;
  balance: number;
  isLocked: boolean;
}

interface WalletsSummary {
  kycStatus: string;
  biFastQuota: { usedThisMonth: number; freeQuota: number; remainingFree: number };
  wallets: WalletItem[];
}

const BANKS = ["BCA", "MANDIRI", "BNI", "BRI", "BSI", "CIMB", "JAGO", "SEABANK"] as const;

export default function TransferPage() {
  const { profile } = useSession();
  const [tab, setTab] = useState<"P2P" | "BANK">("P2P");
  const [summary, setSummary] = useState<WalletsSummary | null>(null);
  const [sourceWalletId, setSourceWalletId] = useState("");

  // P2P state
  const [recipientPhone, setRecipientPhone] = useState("+6281234567890");
  const [recipientInfo, setRecipientInfo] = useState<{
    phoneNumber: string;
    maskedName: string;
  } | null>(null);
  const [p2pAmount, setP2pAmount] = useState("50000");
  const [p2pNotes, setP2pNotes] = useState("");

  // Bank BI-FAST state
  const [bankCode, setBankCode] = useState<(typeof BANKS)[number]>("BCA");
  const [accountNumber, setAccountNumber] = useState("8800112233");
  const [accountHolder, setAccountHolder] = useState("Raka Pratama");
  const [bankAmount, setBankAmount] = useState("100000");
  const [bankNotes, setBankNotes] = useState("");

  const [pinOpen, setPinOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallets = useCallback(async () => {
    if (!profile) return;
    const res = await apiFetch<WalletsSummary>("/api/v1/wallets");
    setSummary(res);
    const usable = res.wallets.filter(
      (w) => w.walletType === "MAIN" || w.walletType === "POCKET"
    );
    if (usable.length > 0) {
      setSourceWalletId((prev) => prev || usable[0].id);
    }
  }, [profile]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const phoneParam = new URLSearchParams(window.location.search).get("phone");
      if (phoneParam) {
        setRecipientPhone(phoneParam);
      }
    }
    void loadWallets();
  }, [loadWallets]);

  async function handleLookupRecipient(phoneOverride?: string) {
    const target = phoneOverride ?? recipientPhone;
    if (!target.trim()) return;
    setBusy(true);
    setError(null);
    setRecipientInfo(null);
    try {
      const res = await apiFetch<{ phoneNumber: string; maskedName: string }>(
        `/api/v1/transfers/lookup?phone=${encodeURIComponent(target)}`
      );
      setRecipientPhone(res.phoneNumber);
      setRecipientInfo(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Penerima tidak ditemukan.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAuthorizedTransfer(txAuthToken: string) {
    setError(null);
    try {
      if (tab === "P2P") {
        const tx = await apiFetch<ReceiptTransaction>("/api/v1/transfers/p2p", {
          method: "POST",
          idempotencyKey: makeIdempotencyKey("p2p"),
          body: JSON.stringify({
            recipient_phone: recipientPhone,
            source_wallet_id: sourceWalletId,
            amount: parseInt(p2pAmount.replace(/\D/g, ""), 10),
            notes: p2pNotes,
            tx_auth_token: txAuthToken,
          }),
        });
        setPinOpen(false);
        setReceipt(tx);
      } else {
        const tx = await apiFetch<ReceiptTransaction>("/api/v1/transfers/bank", {
          method: "POST",
          idempotencyKey: makeIdempotencyKey("bifast"),
          body: JSON.stringify({
            bank_code: bankCode,
            account_number: accountNumber,
            account_holder_name: accountHolder,
            source_wallet_id: sourceWalletId,
            amount: parseInt(bankAmount.replace(/\D/g, ""), 10),
            notes: bankNotes,
            tx_auth_token: txAuthToken,
          }),
        });
        setPinOpen(false);
        setReceipt(tx);
      }
      await loadWallets();
    } catch (err) {
      setPinOpen(false);
      setError(err instanceof Error ? err.message : "Transfer gagal diproses.");
    }
  }

  const usableWallets =
    summary?.wallets.filter((w) => w.walletType === "MAIN" || w.walletType === "POCKET") || [];
  const selectedWallet = usableWallets.find((w) => w.id === sourceWalletId) || null;
  const parsedP2p = parseInt(p2pAmount.replace(/\D/g, ""), 10) || 0;
  const parsedBank = parseInt(bankAmount.replace(/\D/g, ""), 10) || 0;
  const biFastFee = summary && summary.biFastQuota.remainingFree > 0 ? 0 : 2500;
  const isKycVerified = summary?.kycStatus === "VERIFIED";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">
          Transfer Dana
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Gratis sesama SakuKilat dan kuota gratis 10x/bulan ke semua bank nasional via BI-FAST.
        </p>
      </div>

      <div className="inline-flex p-1 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] gap-1">
        <button
          type="button"
          onClick={() => {
            setTab("P2P");
            setError(null);
          }}
          className={`px-4 h-9 rounded-[8px] text-sm font-medium transition-colors ${
            tab === "P2P"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          Sesama SakuKilat (Rp 0)
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("BANK");
            setError(null);
          }}
          className={`px-4 h-9 rounded-[8px] text-sm font-medium transition-colors ${
            tab === "BANK"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          Transfer Bank BI-FAST
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {tab === "P2P" ? (
          <div className="sk-card lg:col-span-7 space-y-4">
            <h2 className="text-[17px] font-semibold">Transfer Instan Sesama Pengguna</h2>

            <div>
              <span className="block text-xs text-[var(--muted)] mb-1.5">
                Kontak Cepat SakuKilat
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Raka Pratama", phone: "+6281234567890" },
                  { label: "Sari Wulandari", phone: "+6281398765432" },
                  { label: "Pak Budi", phone: "+6281122334455" },
                ]
                  .filter((c) => c.phone !== profile?.user.phone_number)
                  .map((c) => (
                    <button
                      key={c.phone}
                      type="button"
                      onClick={() => {
                        setRecipientPhone(c.phone);
                        void handleLookupRecipient(c.phone);
                      }}
                      className="px-3 h-8 rounded-[8px] border border-[var(--border)] bg-[var(--ground)] hover:bg-[var(--accent-soft)] text-xs font-medium"
                    >
                      {c.label}
                    </button>
                  ))}
              </div>
            </div>

            <div>
              <label htmlFor="p2p-phone" className="block text-sm font-medium mb-1">
                Nomor HP Tujuan
              </label>
              <div className="flex gap-2">
                <input
                  id="p2p-phone"
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => {
                    setRecipientPhone(e.target.value);
                    setRecipientInfo(null);
                  }}
                  placeholder="081234567890"
                  className="sk-input num"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleLookupRecipient()}
                  className="sk-btn shrink-0"
                >
                  <Search className="w-4 h-4" />
                  Cek Nama
                </button>
              </div>
            </div>

            {recipientInfo && (
              <div className="p-3.5 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <UserCheck className="w-4 h-4" />
                  Penerima: {recipientInfo.maskedName}
                </span>
                <span className="font-mono-id text-xs">{recipientInfo.phoneNumber}</span>
              </div>
            )}

            <div>
              <label htmlFor="p2p-wallet" className="block text-sm font-medium mb-1">
                Sumber Dana
              </label>
              <select
                id="p2p-wallet"
                value={sourceWalletId}
                onChange={(e) => setSourceWalletId(e.target.value)}
                className="sk-input"
              >
                {usableWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {formatRupiah(w.balance)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="p2p-amount" className="block text-sm font-medium mb-1">
                Nominal Transfer
              </label>
              <input
                id="p2p-amount"
                type="text"
                inputMode="numeric"
                value={p2pAmount}
                onChange={(e) => setP2pAmount(e.target.value.replace(/\D/g, ""))}
                className="sk-input text-lg font-semibold num"
              />
            </div>

            <div>
              <label htmlFor="p2p-notes" className="block text-sm font-medium mb-1">
                Catatan (Opsional)
              </label>
              <input
                id="p2p-notes"
                type="text"
                value={p2pNotes}
                onChange={(e) => setP2pNotes(e.target.value)}
                placeholder="Misal: Bayar makan siang"
                className="sk-input"
              />
            </div>

            <button
              type="button"
              disabled={
                !recipientInfo ||
                parsedP2p < 1000 ||
                !selectedWallet ||
                parsedP2p > selectedWallet.balance ||
                selectedWallet.isLocked
              }
              onClick={() => setPinOpen(true)}
              className="sk-btn sk-btn-primary w-full min-h-[46px]"
            >
              <Send className="w-4 h-4" />
              Kirim Transfer P2P (Admin Rp 0)
            </button>
          </div>
        ) : (
          <div className="sk-card lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[17px] font-semibold">Transfer Antar-Bank (BI-FAST)</h2>
              {summary && (
                <span className="sk-pill sk-pill-accent num">
                  Sisa Kuota Gratis: {summary.biFastQuota.remainingFree}/
                  {summary.biFastQuota.freeQuota}x bulan ini
                </span>
              )}
            </div>

            {!isKycVerified && (
              <div className="p-4 rounded-[12px] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] text-sm space-y-2">
                <p className="font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Membutuhkan Akun KYC Verified
                </p>
                <p className="text-xs">
                  Sesuai regulasi BI, transfer ke rekening bank hanya aktif setelah verifikasi
                  e-KTP &amp; Liveness selesai.
                </p>
                <Link href="/profil" className="sk-btn min-h-[34px] text-xs">
                  Lakukan Verifikasi KYC Sekarang
                </Link>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="bank-code" className="block text-sm font-medium mb-1">
                  Bank Tujuan
                </label>
                <select
                  id="bank-code"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value as (typeof BANKS)[number])}
                  className="sk-input"
                >
                  {BANKS.map((b) => (
                    <option key={b} value={b}>
                      Bank {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="bank-acc" className="block text-sm font-medium mb-1">
                  Nomor Rekening
                </label>
                <input
                  id="bank-acc"
                  type="text"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  className="sk-input font-mono-id"
                />
              </div>
            </div>

            <div>
              <label htmlFor="bank-holder" className="block text-sm font-medium mb-1">
                Nama Pemilik Rekening
              </label>
              <input
                id="bank-holder"
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                className="sk-input"
              />
            </div>

            <div>
              <label htmlFor="bank-wallet" className="block text-sm font-medium mb-1">
                Sumber Dana
              </label>
              <select
                id="bank-wallet"
                value={sourceWalletId}
                onChange={(e) => setSourceWalletId(e.target.value)}
                className="sk-input"
              >
                {usableWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {formatRupiah(w.balance)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="bank-amount" className="block text-sm font-medium mb-1">
                Nominal Transfer (Min. Rp 10.000)
              </label>
              <input
                id="bank-amount"
                type="text"
                inputMode="numeric"
                value={bankAmount}
                onChange={(e) => setBankAmount(e.target.value.replace(/\D/g, ""))}
                className="sk-input text-lg font-semibold num"
              />
            </div>

            <div>
              <label htmlFor="bank-notes" className="block text-sm font-medium mb-1">
                Berita Transfer (Opsional)
              </label>
              <input
                id="bank-notes"
                type="text"
                value={bankNotes}
                onChange={(e) => setBankNotes(e.target.value)}
                className="sk-input"
              />
            </div>

            <button
              type="button"
              disabled={
                !isKycVerified ||
                parsedBank < 10_000 ||
                !selectedWallet ||
                parsedBank + biFastFee > selectedWallet.balance ||
                selectedWallet.isLocked
              }
              onClick={() => setPinOpen(true)}
              className="sk-btn sk-btn-primary w-full min-h-[46px]"
            >
              <Building2 className="w-4 h-4" />
              Kirim via BI-FAST ({biFastFee === 0 ? "Gratis" : `Admin ${formatRupiah(biFastFee)}`})
            </button>
          </div>
        )}

        {/* Right Info Card */}
        <aside className="sk-card lg:col-span-5 space-y-4">
          <h2 className="text-[17px] font-semibold">Ringkasan Biaya &amp; Keamanan</h2>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Kanal</dt>
              <dd className="font-medium">
                {tab === "P2P" ? "Internal Ledger SakuKilat" : "BI-FAST Real-time"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Nominal</dt>
              <dd className="num font-medium">
                {formatRupiah(tab === "P2P" ? parsedP2p : parsedBank)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Biaya Admin</dt>
              <dd className="num font-medium text-[var(--positive)]">
                {tab === "P2P" ? "Rp 0" : formatRupiah(biFastFee)}
              </dd>
            </div>
            <div className="pt-2.5 border-t border-[var(--rule)] flex justify-between font-semibold">
              <dt>Total Debit</dt>
              <dd className="num text-[var(--accent)]">
                {formatRupiah(tab === "P2P" ? parsedP2p : parsedBank + biFastFee)}
              </dd>
            </div>
          </dl>

          <div className="p-3.5 rounded-[10px] bg-[var(--ground)] text-xs text-[var(--muted)] space-y-1.5">
            <p className="font-medium text-[var(--text)] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--positive)]" />
              Jaminan Transaksi Atomik
            </p>
            <p>
              Dilindungi kunci idempotensi <span className="font-mono-id">X-Idempotency-Key</span>,
              penyamaran nama penerima (US-05), dan token otorisasi PIN 60 detik.
            </p>
          </div>
        </aside>
      </div>

      <PinAuthModal
        open={pinOpen}
        title={tab === "P2P" ? "Konfirmasi Transfer P2P" : `Konfirmasi Transfer ${bankCode}`}
        amount={tab === "P2P" ? parsedP2p : parsedBank + biFastFee}
        biometricEnabled={profile?.user.biometric_enabled}
        onClose={() => setPinOpen(false)}
        onAuthorized={handleAuthorizedTransfer}
      />

      <ReceiptModal tx={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
