"use client";

import React, { useState } from "react";
import { Delete, Fingerprint, Lock, X } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { formatRupiah } from "./Formatters";

interface PinAuthModalProps {
  open: boolean;
  title?: string;
  amount?: number;
  subtitle?: string;
  biometricEnabled?: boolean;
  onClose: () => void;
  onAuthorized: (txAuthToken: string) => Promise<void> | void;
}

export function PinAuthModal({
  open,
  title = "Konfirmasi PIN SakuKilat",
  amount,
  subtitle = "Masukkan 6-digit PIN untuk otorisasi transaksi (berlaku 60 detik).",
  biometricEnabled = false,
  onClose,
  onAuthorized,
}: PinAuthModalProps) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submitPin(nextPin: string) {
    if (nextPin.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ tx_auth_token: string }>("/api/v1/auth/pin/verify", {
        method: "POST",
        body: JSON.stringify({ pin: nextPin }),
      });
      setPin("");
      await onAuthorized(res.tx_auth_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PIN tidak valid.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometric() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ tx_auth_token: string }>("/api/v1/auth/biometric", {
        method: "POST",
        body: JSON.stringify({ action: "authorize" }),
      });
      setPin("");
      await onAuthorized(res.tx_auth_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Otorisasi biometrik gagal.");
    } finally {
      setLoading(false);
    }
  }

  function appendDigit(digit: string) {
    if (loading || pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    setError(null);
    if (next.length === 6) {
      void submitPin(next);
    }
  }

  function handleBackspace() {
    if (loading) return;
    setPin((prev) => prev.slice(0, -1));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
    >
      <div
        className="w-full sm:max-w-[400px] bg-[var(--surface)] border border-[var(--border)] rounded-t-[20px] sm:rounded-[20px] p-6"
        style={{ boxShadow: "0 12px 32px rgba(27,29,31,0.14)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-ink)] flex items-center justify-center">
              <Lock className="w-4 h-4" strokeWidth={1.6} />
            </div>
            <div>
              <h2 id="pin-modal-title" className="text-[17px] font-semibold text-[var(--text)]">
                {title}
              </h2>
              {amount !== undefined && (
                <p className="text-sm font-semibold text-[var(--accent)] num">
                  {formatRupiah(amount)}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPin("");
              setError(null);
              onClose();
            }}
            className="w-9 h-9 rounded-[8px] flex items-center justify-center text-[var(--muted)] hover:bg-[var(--raised)]"
            aria-label="Tutup dialog PIN"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-3 text-sm text-[var(--muted)]">{subtitle}</p>

        {/* PIN input fallback + 6 dots */}
        <div className="mt-5 flex items-center justify-center gap-3" aria-live="polite">
          {Array.from({ length: 6 }).map((_, idx) => (
            <span
              key={idx}
              className="w-3.5 h-3.5 rounded-full border transition-colors"
              style={{
                borderColor: idx < pin.length ? "var(--accent)" : "var(--control)",
                background: idx < pin.length ? "var(--accent)" : "transparent",
              }}
            />
          ))}
        </div>

        <div className="mt-3">
          <label htmlFor="pin-keyboard-input" className="sr-only">
            Masukkan 6 digit PIN
          </label>
          <input
            id="pin-keyboard-input"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/\D/g, "").slice(0, 6);
              setPin(cleaned);
              if (cleaned.length === 6) void submitPin(cleaned);
            }}
            placeholder="Atau ketik 6 digit PIN (demo: 123456)"
            className="sk-input text-center text-sm tracking-widest num"
          />
        </div>

        {error && (
          <p className="mt-3 text-xs font-medium text-[var(--negative)] text-center">{error}</p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              disabled={loading}
              onClick={() => appendDigit(d)}
              className="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] text-lg font-semibold num transition-colors"
            >
              {d}
            </button>
          ))}
          {biometricEnabled ? (
            <button
              type="button"
              disabled={loading}
              onClick={handleBiometric}
              className="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent-ink)] flex items-center justify-center gap-1.5 text-xs font-medium"
              title="Otorisasi Biometrik"
            >
              <Fingerprint className="w-4 h-4" />
              Biometrik
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => appendDigit("0")}
            className="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] text-lg font-semibold num transition-colors"
          >
            0
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleBackspace}
            className="h-12 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--raised)] flex items-center justify-center text-[var(--muted)]"
            aria-label="Hapus digit PIN"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <p className="mt-3 text-xs text-center text-[var(--muted)]">
            Memverifikasi &amp; mengeksekusi transaksi atomik...
          </p>
        )}
      </div>
    </div>
  );
}

