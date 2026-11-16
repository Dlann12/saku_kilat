"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  Droplets,
  Eye,
  EyeOff,
  Gamepad2,
  HeartPulse,
  Lock,
  Plus,
  QrCode,
  Smartphone,
  Users,
  Utensils,
  Car,
  Shield,
  Zap,
  Receipt,
} from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import {
  formatDateTimeWib,
  formatRupiah,
  formatSignedRupiah,
  getPocketColors,
} from "@/components/Formatters";
import { ReceiptModal, type ReceiptTransaction } from "@/components/ReceiptModal";

interface WalletItem {
  id: string;
  walletType: string;
  name: string;
  categoryKey: string;
  balance: number;
  targetAmount: number | null;
  isLocked: boolean;
}

interface WalletsPayload {
  mainBalance: number;
  pocketsTotal: number;
  totalBalance: number;
  balanceLimit: number;
  kycStatus: string;
  biFastQuota: { usedThisMonth: number; freeQuota: number; remainingFree: number };
  mainWallet: WalletItem | null;
  pockets: WalletItem[];
}

interface TxRow {
  id: string;
  referenceNumber: string;
  transactionType: string;
  status: string;
  amount: number;
  adminFee: number;
  totalAmount: number;
  title: string;
  category: string;
  direction: "IN" | "OUT" | "INTERNAL";
  metadata: Record<string, unknown>;
  createdAt: string;
}

function PocketCategoryIcon({ categoryKey }: { categoryKey: string }) {
  switch (categoryKey) {
    case "food":
      return <Utensils className="w-4 h-4" strokeWidth={1.6} />;
    case "transport":
      return <Car className="w-4 h-4" strokeWidth={1.6} />;
    case "savings":
      return <Shield className="w-4 h-4" strokeWidth={1.6} />;
    default:
      return <Receipt className="w-4 h-4" strokeWidth={1.6} />;
  }
}

export default function HomePage() {
  const { profile, loading: sessionLoading } = useSession();
  const [wallets, setWallets] = useState<WalletsPayload | null>(null);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideBalance, setHideBalance] = useState(false);
  const [selectedTx, setSelectedTx] = useState<ReceiptTransaction | null>(null);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [wRes, tRes] = await Promise.all([
        apiFetch<WalletsPayload>("/api/v1/wallets"),
        apiFetch<{ transactions: TxRow[] }>("/api/v1/transactions?limit=4"),
      ]);
      setWallets(wRes);
      setTransactions(tRes.transactions);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const firstName = profile?.user.full_name.split(" ")[0] || "Pengguna";
  const kycVerified = profile?.user.kyc_status === "VERIFIED";

  return (
    <div className="space-y-6">
      {/* Header Row matching PRD Home Screen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight leading-tight">
            Halo, {firstName}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Transaksi cepat, kelola uang harian dan kantong anggaran dalam satu tempat.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/profil"
            className={`sk-pill ${
              kycVerified
                ? "sk-pill-pos"
                : profile?.user.kyc_status === "PENDING"
                ? "sk-pill-warn"
                : "sk-pill-neutral"
            }`}
          >
            {kycVerified
              ? "KYC Verified"
              : profile?.user.kyc_status === "PENDING"
              ? "KYC Diproses"
              : "Akun Basic (Limit Rp2 Jt)"}
          </Link>
        </div>
      </div>

      {/* Main 12-Col Grid: Lead Balance Card (7 cols) + Quick PPOB Grid (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Balance Card (Flat surface, 1px border, no gradient per DESIGN.md) */}
        <section
          className="sk-card lg:col-span-7 flex flex-col justify-between h-full"
          aria-label="Ringkasan Saldo SakuKilat"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--muted)]">
                Total Saldo SakuKilat
              </p>
              {sessionLoading || loading || !wallets ? (
                <div className="h-10 w-52 mt-2 rounded-[6px] bg-[var(--ground)]" />
              ) : (
                <p className="mt-1.5 text-[32px] font-semibold tracking-tight leading-none num text-[var(--text)]">
                  {hideBalance ? "Rp ••••••••" : formatRupiah(wallets.totalBalance)}
                </p>
              )}
              {wallets && (
                <p className="mt-2.5 text-[13px] text-[var(--muted)] num">
                  Saldo Utama{" "}
                  <span className="font-medium text-[var(--text)]">
                    {hideBalance ? "••••" : formatRupiah(wallets.mainBalance)}
                  </span>
                  <span className="mx-2 text-[var(--control)]">|</span>
                  Smart Pockets{" "}
                  <span className="font-medium text-[var(--text)]">
                    {hideBalance ? "••••" : formatRupiah(wallets.pocketsTotal)}
                  </span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setHideBalance((v) => !v)}
              className="w-10 h-10 rounded-[10px] border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:bg-[var(--raised)]"
              aria-label={hideBalance ? "Tampilkan saldo" : "Sembunyikan saldo"}
              title={hideBalance ? "Tampilkan saldo" : "Sembunyikan saldo"}
            >
              {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Primary 3 Actions from PRD Wireframe: Top Up, Transfer, Pindah + Scan QRIS shortcut */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              href="/topup"
              className="flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-[10px] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[#1750b8] transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              Top Up
            </Link>
            <Link
              href="/transfer"
              className="flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-ink)] text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <ArrowUpRight className="w-4 h-4" strokeWidth={1.8} />
              Transfer
            </Link>
            <Link
              href="/pockets"
              className="flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-[10px] bg-[var(--ground)] border border-[var(--border)] text-[var(--text)] text-sm font-medium hover:bg-[var(--raised)] transition-colors"
            >
              <ArrowLeftRight className="w-4 h-4" strokeWidth={1.7} />
              Pindah
            </Link>
            <Link
              href="/qris"
              className="flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-[10px] bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <QrCode className="w-4 h-4" strokeWidth={1.7} />
              Bayar QRIS
            </Link>
          </div>

          {wallets && (
            <div className="mt-5 pt-4 border-t border-[var(--rule)] flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
              <span>
                Batas saldo akun:{" "}
                <strong className="font-medium text-[var(--text)] num">
                  {formatRupiah(wallets.balanceLimit)}
                </strong>
              </span>
              <span className="num">
                Kuota gratis BI-FAST bulan ini:{" "}
                <strong className="font-medium text-[var(--text)]">
                  {wallets.biFastQuota.remainingFree}/{wallets.biFastQuota.freeQuota}x
                </strong>
              </span>
            </div>
          )}
        </section>

        {/* Bayar & Beli (PPOB + Split Bill) 6-tile grid */}
        <section className="sk-card lg:col-span-5 flex flex-col justify-between h-full" aria-label="Bayar dan Beli PPOB">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[17px] font-semibold">Bayar &amp; Beli (PPOB)</h2>
            <Link
              href="/ppob"
              className="text-sm font-medium text-[var(--accent)] inline-flex items-center gap-0.5 hover:underline"
            >
              Semua produk <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {[
              { href: "/ppob?cat=PULSA", label: "Pulsa & Data", icon: Smartphone },
              { href: "/ppob?cat=PLN_TOKEN", label: "Listrik PLN", icon: Zap },
              { href: "/ppob?cat=PDAM", label: "Air PDAM", icon: Droplets },
              { href: "/ppob?cat=BPJS", label: "BPJS Kes", icon: HeartPulse },
              { href: "/ppob?cat=GAME", label: "Voucher Game", icon: Gamepad2 },
              { href: "/split-bill", label: "Patungan", icon: Users },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex flex-col items-center justify-center gap-2 p-3 min-h-[82px] rounded-[10px] bg-[var(--ground)] border border-[var(--border)] hover:bg-[var(--accent-soft)] hover:border-[#bfe1ff] transition-colors text-center"
                >
                  <Icon className="w-5 h-5 text-[var(--accent-ink)]" strokeWidth={1.6} />
                  <span className="text-[12px] font-medium text-[var(--text)] leading-tight">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {/* Second Row: Kantong Pintar (Smart Pockets) + Transaksi Terakhir */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Smart Pockets */}
        <section className="sk-card lg:col-span-5" aria-label="Kantong Pintar">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[17px] font-semibold">Kantong Pintar (Smart Pockets)</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Pemisahan anggaran harian bebas biaya admin
              </p>
            </div>
            <Link
              href="/pockets"
              className="text-sm font-medium text-[var(--accent)] inline-flex items-center gap-0.5 hover:underline"
            >
              Kelola <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {!wallets ? (
            <div className="h-32 rounded-[10px] bg-[var(--ground)]" />
          ) : wallets.pockets.length === 0 ? (
            <div className="border border-dashed border-[var(--control)] rounded-[10px] p-5 text-center">
              <p className="text-sm text-[var(--muted)]">
                Belum ada Kantong Pintar. Pisahkan uang makan atau dana darurat Anda.
              </p>
              <Link href="/pockets" className="sk-btn sk-btn-primary mt-3">
                + Buat Kantong
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
              {wallets.pockets.slice(0, 4).map((p) => {
                const tint = getPocketColors(p.categoryKey);
                const progress =
                  p.targetAmount && p.targetAmount > 0
                    ? Math.min(100, Math.round((p.balance / p.targetAmount) * 100))
                    : null;
                return (
                  <Link
                    key={p.id}
                    href="/pockets"
                    className="block p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="flex items-center justify-center shrink-0"
                          style={{ color: tint.ink }}
                        >
                          <PocketCategoryIcon categoryKey={p.categoryKey} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text)] truncate flex items-center gap-1.5">
                            {p.name}
                            {p.isLocked && (
                              <Lock
                                className="w-3.5 h-3.5 text-[var(--muted)] shrink-0"
                                aria-label="Terkunci"
                              />
                            )}
                          </p>
                          <span
                            className="inline-block mt-0.5 px-2 py-0.5 rounded-[5px] text-[11px] font-medium"
                            style={{ background: tint.bg, color: tint.ink }}
                          >
                            {tint.label}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm font-semibold num text-[var(--text)] whitespace-nowrap">
                        {hideBalance ? "Rp ••••" : formatRupiah(p.balance)}
                      </p>
                    </div>
                    {progress !== null && p.targetAmount && (
                      <div className="mt-2.5">
                        <div className="h-1.5 w-full rounded-full bg-[var(--rule)] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${progress}%`, background: tint.ink }}
                          />
                        </div>
                        <div className="mt-1 flex justify-between text-[11px] text-[var(--faint)] num">
                          <span>{progress}% tercapai</span>
                          <span>Target {formatRupiah(p.targetAmount)}</span>
                        </div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent Transactions */}
        <section className="sk-card lg:col-span-7" aria-label="Transaksi Terakhir">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[17px] font-semibold">Transaksi Terakhir</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Klik baris untuk melihat atau mengunduh resi digital
              </p>
            </div>
            <Link
              href="/riwayat"
              className="text-sm font-medium text-[var(--accent)] inline-flex items-center gap-0.5 hover:underline"
            >
              Lihat Semua <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-[8px] bg-[var(--ground)]" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="border border-dashed border-[var(--control)] rounded-[10px] p-6 text-center text-sm text-[var(--muted)]">
              Belum ada mutasi transaksi pada akun ini.
            </div>
          ) : (
            <div className="divide-y divide-[var(--rule)]">
              {transactions.map((tx) => {
                const isIn = tx.direction === "IN";
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setSelectedTx(tx)}
                    className="w-full py-3 px-2 -mx-2 rounded-[8px] hover:bg-[var(--raised)] transition-colors flex items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate">
                        {tx.title}
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {tx.category} · {formatDateTimeWib(tx.createdAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-semibold num ${
                          isIn ? "text-[var(--positive)]" : "text-[var(--text)]"
                        }`}
                      >
                        {hideBalance
                          ? "••••"
                          : formatSignedRupiah(
                              tx.direction === "OUT" ? tx.totalAmount : tx.amount,
                              tx.direction
                            )}
                      </p>
                      <p className="text-[11px] text-[var(--faint)] font-mono-id">
                        {tx.status}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ReceiptModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
    </div>
  );
}
