"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Lock, Plus, Unlock, Wallet } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import {
  formatRupiah,
  getPocketColors,
  makeIdempotencyKey,
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
  mainWallet: WalletItem | null;
  pockets: WalletItem[];
  wallets: WalletItem[];
}

export default function PocketsPage() {
  const { profile } = useSession();
  const [data, setData] = useState<WalletsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Create pocket state
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"food" | "transport" | "savings" | "bills">(
    "savings"
  );
  const [newTarget, setNewTarget] = useState("1000000");

  // Move funds state
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [moveAmount, setMoveAmount] = useState("100000");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptTransaction | null>(null);

  const loadWallets = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const res = await apiFetch<WalletsPayload>("/api/v1/wallets");
      setData(res);
      const movable = res.wallets.filter(
        (w) => w.walletType === "MAIN" || w.walletType === "POCKET"
      );
      if (movable.length >= 2) {
        setSourceId((prev) => prev || movable[0].id);
        setDestId((prev) => prev || movable[1].id);
      }
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  async function handleCreatePocket(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const targetNum = parseInt(newTarget.replace(/\D/g, ""), 10);
      await apiFetch("/api/v1/wallets/pockets", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          category_key: newCategory,
          target_amount: targetNum >= 10_000 ? targetNum : undefined,
        }),
      });
      setNewName("");
      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat kantong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveFunds(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const parsed = parseInt(moveAmount.replace(/\D/g, ""), 10);
      const tx = await apiFetch<ReceiptTransaction>("/api/v1/wallets/move", {
        method: "POST",
        idempotencyKey: makeIdempotencyKey("move"),
        body: JSON.stringify({
          source_wallet_id: sourceId,
          destination_wallet_id: destId,
          amount: parsed,
        }),
      });
      setReceipt(tx);
      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memindahkan saldo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleLock(pocket: WalletItem) {
    setError(null);
    try {
      await apiFetch(`/api/v1/wallets/pockets/${pocket.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_locked: !pocket.isLocked }),
      });
      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status kunci.");
    }
  }

  const movableWallets =
    data?.wallets.filter((w) => w.walletType === "MAIN" || w.walletType === "POCKET") || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">
          Kantong Pintar (Smart Pockets)
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Pisahkan dana makan, transportasi, dan tabungan tanpa biaya admin. Kunci kantong
          untuk melindungi tabungan dari pengeluaran tidak sengaja.
        </p>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sk-card">
            <p className="text-xs text-[var(--muted)]">Total Saldo SakuKilat</p>
            <p className="text-2xl font-semibold num mt-1">{formatRupiah(data.totalBalance)}</p>
          </div>
          <div className="sk-card">
            <p className="text-xs text-[var(--muted)]">Saldo Utama (Bebas Pakai)</p>
            <p className="text-2xl font-semibold num mt-1">{formatRupiah(data.mainBalance)}</p>
          </div>
          <div className="sk-card">
            <p className="text-xs text-[var(--muted)]">Total di {data.pockets.length} Kantong</p>
            <p className="text-2xl font-semibold num mt-1 text-[var(--accent)]">
              {formatRupiah(data.pocketsTotal)}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Pockets List */}
        <section className="sk-card lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold">Daftar Kantong Aktif</h2>
            <span className="text-xs text-[var(--muted)] num">
              {data?.pockets.length || 0}/12 kantong
            </span>
          </div>

          {loading ? (
            <div className="h-36 rounded-[10px] bg-[var(--ground)]" />
          ) : !data || data.pockets.length === 0 ? (
            <div className="border border-dashed border-[var(--control)] rounded-[10px] p-6 text-center text-sm text-[var(--muted)]">
              Anda belum memiliki Kantong Pintar. Buat satu di panel sebelah kanan.
            </div>
          ) : (
            <div className="space-y-3">
              {data.pockets.map((pocket) => {
                const tint = getPocketColors(pocket.categoryKey);
                const pct =
                  pocket.targetAmount && pocket.targetAmount > 0
                    ? Math.min(100, Math.round((pocket.balance / pocket.targetAmount) * 100))
                    : null;
                return (
                  <div
                    key={pocket.id}
                    className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex items-center justify-center shrink-0"
                          style={{ color: tint.ink }}
                        >
                          <Wallet className="w-5 h-5" strokeWidth={1.6} />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-semibold">{pocket.name}</p>
                            <span
                              className="px-2 py-0.5 rounded-[5px] text-[11px] font-medium"
                              style={{ background: tint.bg, color: tint.ink }}
                            >
                              {tint.label}
                            </span>
                            {pocket.isLocked && (
                              <span className="sk-pill sk-pill-warn">Terkunci</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <p className="text-lg font-semibold num">{formatRupiah(pocket.balance)}</p>
                        <button
                          type="button"
                          onClick={() => void handleToggleLock(pocket)}
                          className="sk-btn min-h-[34px] px-3 text-xs"
                          title={pocket.isLocked ? "Buka kunci kantong" : "Kunci kantong"}
                        >
                          {pocket.isLocked ? (
                            <>
                              <Unlock className="w-3.5 h-3.5" /> Buka
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" /> Kunci
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {pct !== null && pocket.targetAmount && (
                      <div className="mt-3">
                        <div className="h-2 w-full rounded-full bg-[var(--rule)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-[width]"
                            style={{ width: `${pct}%`, background: tint.ink }}
                          />
                        </div>
                        <div className="mt-1.5 flex justify-between text-xs text-[var(--muted)] num">
                          <span>Terkumpul {pct}%</span>
                          <span>Target {formatRupiah(pocket.targetAmount)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Move Funds + Create New Pocket */}
        <div className="lg:col-span-5 space-y-6">
          <form onSubmit={handleMoveFunds} className="sk-card space-y-4">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-[17px] font-semibold">Pindah Saldo (Rp 0 Admin)</h2>
            </div>

            <div>
              <label htmlFor="move-src" className="block text-sm font-medium mb-1">
                Dari Dompet
              </label>
              <select
                id="move-src"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="sk-input"
                disabled={movableWallets.length < 2}
              >
                {movableWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatRupiah(w.balance)}){w.isLocked ? " [Terkunci]" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="move-dst" className="block text-sm font-medium mb-1">
                Ke Dompet
              </label>
              <select
                id="move-dst"
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
                className="sk-input"
                disabled={movableWallets.length < 2}
              >
                {movableWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatRupiah(w.balance)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="move-amount" className="block text-sm font-medium mb-1">
                Nominal Pemindahan
              </label>
              <input
                id="move-amount"
                type="text"
                inputMode="numeric"
                value={moveAmount}
                onChange={(e) => setMoveAmount(e.target.value.replace(/\D/g, ""))}
                className="sk-input num font-semibold"
                required
              />
            </div>

            <button
              type="submit"
              disabled={busy || movableWallets.length < 2 || sourceId === destId}
              className="sk-btn sk-btn-primary w-full min-h-[44px]"
            >
              Pindahkan Sekarang
            </button>
          </form>

          <form onSubmit={handleCreatePocket} className="sk-card space-y-4">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-[17px] font-semibold">Buat Kantong Pintar Baru</h2>
            </div>

            <div>
              <label htmlFor="pocket-name" className="block text-sm font-medium mb-1">
                Nama Kantong
              </label>
              <input
                id="pocket-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Misal: Dana Liburan, Belanja Bulanan"
                className="sk-input"
                required
              />
            </div>

            <div>
              <label htmlFor="pocket-cat" className="block text-sm font-medium mb-1">
                Kategori Warna
              </label>
              <select
                id="pocket-cat"
                value={newCategory}
                onChange={(e) =>
                  setNewCategory(e.target.value as "food" | "transport" | "savings" | "bills")
                }
                className="sk-input"
              >
                <option value="food">Konsumsi (Amber Lembut)</option>
                <option value="transport">Transportasi (Biru Langit)</option>
                <option value="savings">Tabungan / Darurat (Hijau Sage)</option>
                <option value="bills">Tagihan Rutin (Teal Lembut)</option>
              </select>
            </div>

            <div>
              <label htmlFor="pocket-target" className="block text-sm font-medium mb-1">
                Target Anggaran (Rp)
              </label>
              <input
                id="pocket-target"
                type="text"
                inputMode="numeric"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value.replace(/\D/g, ""))}
                className="sk-input num"
              />
            </div>

            <button type="submit" disabled={busy} className="sk-btn sk-btn-dark w-full min-h-[44px]">
              Buat Kantong Pintar
            </button>
          </form>
        </div>
      </div>

      <ReceiptModal tx={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
