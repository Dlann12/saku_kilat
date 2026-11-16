"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import { formatDateTimeWib, formatRupiah, makeIdempotencyKey } from "@/components/Formatters";
import { PinAuthModal } from "@/components/PinAuthModal";
import { ReceiptModal, type ReceiptTransaction } from "@/components/ReceiptModal";

interface SplitParticipant {
  id: string;
  userId: string;
  displayName: string;
  phoneNumber: string;
  shareAmount: number;
  status: "PENDING" | "PAID";
}

interface SplitBill {
  id: string;
  creatorUserId: string;
  creatorName: string;
  title: string;
  splitMode: "EQUAL" | "ITEMIZED";
  totalAmount: number;
  collectedAmount: number;
  status: string;
  createdAt: string;
  participants: SplitParticipant[];
}

interface WalletItem {
  id: string;
  walletType: string;
  name: string;
  balance: number;
  isLocked: boolean;
}

const KNOWN_PEERS = [
  { name: "Dlan Kusuma", phone: "+6285211223344" },
  { name: "Raka Pratama", phone: "+6281234567890" },
  { name: "Sari Wulandari", phone: "+6281398765432" },
  { name: "Pak Budi", phone: "+6281122334455" },
];

export default function SplitBillPage() {
  const { profile } = useSession();
  const [bills, setBills] = useState<SplitBill[]>([]);
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [sourceWalletId, setSourceWalletId] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"EQUAL" | "ITEMIZED">("EQUAL");
  const [totalAmount, setTotalAmount] = useState("150000");
  const [selectedPeers, setSelectedPeers] = useState<string[]>(["+6281234567890"]);
  const [items, setItems] = useState<
    Array<{ name: string; price: string; assigned_phones: string[] }>
  >([
    { name: "Menu Utama", price: "60000", assigned_phones: ["+6285211223344"] },
    { name: "Minuman & Snack", price: "40000", assigned_phones: ["+6281234567890"] },
  ]);

  const [payingBillId, setPayingBillId] = useState<string | null>(null);
  const [payingAmount, setPayingAmount] = useState<number>(0);
  const [receipt, setReceipt] = useState<ReceiptTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!profile) return;
    const [bRes, wRes] = await Promise.all([
      apiFetch<{ bills: SplitBill[] }>("/api/v1/split-bills"),
      apiFetch<{ wallets: WalletItem[] }>("/api/v1/wallets"),
    ]);
    setBills(bRes.bills);
    const usable = wRes.wallets.filter(
      (w) => w.walletType === "MAIN" || w.walletType === "POCKET"
    );
    setWallets(usable);
    if (usable.length > 0) setSourceWalletId((prev) => prev || usable[0].id);

    const firstPeer = KNOWN_PEERS.find((p) => p.phone !== profile.user.phone_number);
    if (firstPeer) {
      setSelectedPeers((prev) =>
        prev.filter((ph) => ph !== profile.user.phone_number).length > 0
          ? prev.filter((ph) => ph !== profile.user.phone_number)
          : [firstPeer.phone]
      );
    }
  }, [profile]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function togglePeer(phone: string) {
    setSelectedPeers((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );
  }

  async function handleCreateBill(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload =
        mode === "EQUAL"
          ? {
              title,
              split_mode: "EQUAL",
              participant_phones: selectedPeers,
              total_amount: parseInt(totalAmount.replace(/\D/g, ""), 10),
            }
          : {
              title,
              split_mode: "ITEMIZED",
              participant_phones: selectedPeers,
              items: items.map((it) => ({
                name: it.name,
                price: parseInt(it.price.replace(/\D/g, ""), 10) || 0,
                assigned_phones: it.assigned_phones,
              })),
            };
      await apiFetch("/api/v1/split-bills", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setTitle("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat patungan.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePayShare(txAuthToken: string) {
    if (!payingBillId) return;
    setError(null);
    try {
      const tx = await apiFetch<ReceiptTransaction>(`/api/v1/split-bills/${payingBillId}/pay`, {
        method: "POST",
        idempotencyKey: makeIdempotencyKey("sb"),
        body: JSON.stringify({
          source_wallet_id: sourceWalletId,
          tx_auth_token: txAuthToken,
        }),
      });
      setPayingBillId(null);
      setReceipt(tx);
      await loadData();
    } catch (err) {
      setPayingBillId(null);
      setError(err instanceof Error ? err.message : "Gagal membayar patungan.");
    }
  }

  const availablePeers = KNOWN_PEERS.filter((p) => p.phone !== profile?.user.phone_number);
  const participantPool = profile
    ? [{ name: `${profile.user.full_name} (Saya)`, phone: profile.user.phone_number }, ...availablePeers]
    : KNOWN_PEERS;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">
          Patungan (Split Bill)
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Bagi tagihan secara merata atau per item, lalu kirimkan tagihan langsung ke sesama
          pengguna SakuKilat.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form onSubmit={handleCreateBill} className="sk-card lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-[17px] font-semibold">Buat Tagihan Patungan</h2>
          </div>

          <div>
            <label htmlFor="sb-title" className="block text-sm font-medium mb-1">
              Judul / Acara
            </label>
            <input
              id="sb-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Misal: Makan Malam Tim Proyek"
              className="sk-input"
              required
            />
          </div>

          <div>
            <span className="block text-sm font-medium mb-1.5">Metode Pembagian</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("EQUAL")}
                className={`h-10 rounded-[10px] border text-sm font-medium ${
                  mode === "EQUAL"
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                Bagi Rata
              </button>
              <button
                type="button"
                onClick={() => setMode("ITEMIZED")}
                className={`h-10 rounded-[10px] border text-sm font-medium ${
                  mode === "ITEMIZED"
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                Per Item Struk
              </button>
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium mb-1.5">
              Pilih Teman SakuKilat (Ditagih)
            </span>
            <div className="flex flex-wrap gap-2">
              {availablePeers.map((peer) => {
                const active = selectedPeers.includes(peer.phone);
                return (
                  <button
                    key={peer.phone}
                    type="button"
                    onClick={() => togglePeer(peer.phone)}
                    className={`px-3 h-8 rounded-[8px] border text-xs font-medium transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                        : "border-[var(--border)] bg-[var(--ground)] text-[var(--muted)]"
                    }`}
                  >
                    {peer.name}
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "EQUAL" ? (
            <div>
              <label htmlFor="sb-total" className="block text-sm font-medium mb-1">
                Total Tagihan (Dibagi {selectedPeers.length + 1} orang)
              </label>
              <input
                id="sb-total"
                type="text"
                inputMode="numeric"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value.replace(/\D/g, ""))}
                className="sk-input num font-semibold"
                required
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Daftar Item</span>
                <button
                  type="button"
                  onClick={() =>
                    setItems((prev) => [
                      ...prev,
                      {
                        name: "Item Tambahan",
                        price: "25000",
                        assigned_phones: [profile?.user.phone_number || "+6285211223344"],
                      },
                    ])
                  }
                  className="text-xs font-medium text-[var(--accent)] inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Item
                </button>
              </div>
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-[10px] border border-[var(--border)] bg-[var(--ground)] space-y-2"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={it.name}
                      onChange={(e) => {
                        const copy = [...items];
                        copy[idx].name = e.target.value;
                        setItems(copy);
                      }}
                      placeholder="Nama item"
                      className="sk-input h-9 text-xs"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={it.price}
                      onChange={(e) => {
                        const copy = [...items];
                        copy[idx].price = e.target.value.replace(/\D/g, "");
                        setItems(copy);
                      }}
                      className="sk-input h-9 w-28 text-xs num"
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--negative)]"
                        aria-label="Hapus item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {participantPool
                      .filter(
                        (p) =>
                          p.phone === profile?.user.phone_number ||
                          selectedPeers.includes(p.phone)
                      )
                      .map((p) => {
                        const assigned = it.assigned_phones.includes(p.phone);
                        return (
                          <button
                            key={p.phone}
                            type="button"
                            onClick={() => {
                              const copy = [...items];
                              const curr = copy[idx].assigned_phones;
                              copy[idx].assigned_phones = assigned
                                ? curr.length > 1
                                  ? curr.filter((x) => x !== p.phone)
                                  : curr
                                : [...curr, p.phone];
                              setItems(copy);
                            }}
                            className={`px-2 py-1 rounded-[6px] text-[11px] font-medium border ${
                              assigned
                                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                                : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
                            }`}
                          >
                            {p.name.split(" ")[0]}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || selectedPeers.length === 0}
            className="sk-btn sk-btn-primary w-full min-h-[44px]"
          >
            {busy ? "Mengirim Tagihan..." : "Kirim Tagihan Patungan"}
          </button>
        </form>

        {/* Active & History Split Bills */}
        <section className="sk-card lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[17px] font-semibold">Tagihan Patungan Anda</h2>
            {wallets.length > 0 && (
              <select
                aria-label="Sumber dana bayar patungan"
                value={sourceWalletId}
                onChange={(e) => setSourceWalletId(e.target.value)}
                className="h-9 px-2.5 rounded-[8px] border border-[var(--control)] text-xs bg-[var(--surface)]"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    Bayar pakai: {w.name} ({formatRupiah(w.balance)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {bills.length === 0 ? (
            <div className="border border-dashed border-[var(--control)] rounded-[10px] p-6 text-center text-sm text-[var(--muted)]">
              Belum ada patungan aktif.
            </div>
          ) : (
            <div className="space-y-4">
              {bills.map((b) => {
                const myPending = b.participants.find(
                  (p) => p.userId === profile?.user.id && p.status === "PENDING"
                );
                return (
                  <div
                    key={b.id}
                    className="p-4 rounded-[12px] border border-[var(--border)] space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold">{b.title}</h3>
                          <span
                            className={`sk-pill ${
                              b.status === "SETTLED" ? "sk-pill-pos" : "sk-pill-warn"
                            }`}
                          >
                            {b.status === "SETTLED" ? "Lunas" : "Berjalan"}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--muted)] mt-0.5">
                          Dibuat oleh {b.creatorName} · {formatDateTimeWib(b.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold num">
                          {formatRupiah(b.totalAmount)}
                        </p>
                        <p className="text-xs text-[var(--muted)] num">
                          Terkumpul {formatRupiah(b.collectedAmount)}
                        </p>
                      </div>
                    </div>

                    <div className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
                      {b.participants.map((p) => (
                        <div
                          key={p.id}
                          className="py-2 flex items-center justify-between gap-2 text-sm"
                        >
                          <span>{p.displayName}</span>
                          <div className="flex items-center gap-2.5">
                            <span className="num font-medium">{formatRupiah(p.shareAmount)}</span>
                            <span
                              className={`sk-pill ${
                                p.status === "PAID" ? "sk-pill-pos" : "sk-pill-neutral"
                              }`}
                            >
                              {p.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {myPending && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayingBillId(b.id);
                          setPayingAmount(myPending.shareAmount);
                        }}
                        className="sk-btn sk-btn-primary w-full"
                      >
                        Bayar Bagian Saya ({formatRupiah(myPending.shareAmount)})
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <PinAuthModal
        open={Boolean(payingBillId)}
        title="Otorisasi Pembayaran Patungan"
        amount={payingAmount}
        biometricEnabled={profile?.user.biometric_enabled}
        onClose={() => setPayingBillId(null)}
        onAuthorized={handlePayShare}
      />

      <ReceiptModal tx={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

