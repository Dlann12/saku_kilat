"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { ArrowLeft, Camera, CheckCircle2, ImageUp, QrCode, Store } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { buildQrisPayload } from "@/lib/qris";
import { useSession } from "@/components/AppShell";
import { formatRupiah, makeIdempotencyKey } from "@/components/Formatters";
import { PinAuthModal } from "@/components/PinAuthModal";
import { ReceiptModal, type ReceiptTransaction } from "@/components/ReceiptModal";

interface WalletItem {
  id: string;
  walletType: string;
  name: string;
  categoryKey: string;
  balance: number;
  isLocked: boolean;
}

interface DecodedQris {
  kind: "QRIS" | "PROFILE";
  inquiryId?: string;
  nmid?: string;
  merchantName?: string;
  merchantCity?: string;
  category?: string;
  isDynamic?: boolean;
  amount?: number | null;
  adminFee?: number;
  maskedName?: string;
  phoneNumber?: string;
}

const DEMO_QRIS_MERCHANTS = [
  {
    id: "kenangan",
    label: "Kopi Kenangan Bengkulu (Statis)",
    payload: buildQrisPayload({
      nmid: "ID1026177100022",
      merchantName: "Kopi Kenangan Bengkulu",
      merchantCity: "Kota Bengkulu",
      isDynamic: false,
    }),
    badge: "QRIS Statis",
  },
  {
    id: "warung-budi",
    label: "Warung Kopi Pak Budi (Dinamis Rp 38.000)",
    payload: buildQrisPayload({
      nmid: "ID1026177100011",
      merchantName: "Warung Kopi Pak Budi",
      merchantCity: "Kota Bengkulu",
      amount: 38_000,
      isDynamic: true,
    }),
    badge: "Rp 38.000",
  },
  {
    id: "tj",
    label: "TransJakarta Harmoni (Dinamis Rp 3.500)",
    payload: buildQrisPayload({
      nmid: "ID1026317100033",
      merchantName: "TransJakarta Harmoni",
      merchantCity: "Jakarta Pusat",
      amount: 3_500,
      isDynamic: true,
    }),
    badge: "Rp 3.500",
  },
];

export default function QrisPage() {
  const { profile } = useSession();
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [rawPayload, setRawPayload] = useState("");
  const [decoded, setDecoded] = useState<DecodedQris | null>(null);
  const [amountInput, setAmountInput] = useState("25000");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [presetImages, setPresetImages] = useState<Record<string, string>>({});

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallets = useCallback(async () => {
    if (!profile) return;
    const data = await apiFetch<{ wallets: WalletItem[] }>("/api/v1/wallets");
    const usable = data.wallets.filter(
      (w) => w.walletType === "MAIN" || w.walletType === "POCKET"
    );
    setWallets(usable);
    const defaultPocket =
      usable.find((w) => w.name.toLowerCase().includes("makan") && !w.isLocked) ||
      usable.find((w) => !w.isLocked) ||
      usable[0];
    if (defaultPocket) setSelectedWalletId(defaultPocket.id);
  }, [profile]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    let mounted = true;
    Promise.all(
      DEMO_QRIS_MERCHANTS.map(async (m) => ({
        id: m.id,
        dataUrl: await QRCode.toDataURL(m.payload, { width: 160, margin: 1 }),
      }))
    ).then((items) => {
      if (!mounted) return;
      const map: Record<string, string> = {};
      for (const it of items) map[it.id] = it.dataUrl;
      setPresetImages(map);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handleDecodePayload = useCallback(async (payload: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<DecodedQris>("/api/v1/payments/qris/decode", {
        method: "POST",
        body: JSON.stringify({ raw_qr_payload: payload }),
      });
      setRawPayload(payload);
      setDecoded(res);
      if (res.kind === "QRIS" && res.amount) {
        setAmountInput(String(res.amount));
      } else if (res.kind === "QRIS") {
        setAmountInput("25000");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membaca payload QRIS.");
    } finally {
      setBusy(false);
    }
  }, []);

  async function startCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        "Perangkat atau browser tidak mengizinkan akses kamera. Gunakan Unggah Galeri QR atau Merchant Demo di bawah."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const tick = () => {
        if (!streamRef.current || !videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imgData.data, imgData.width, imgData.height);
            if (code?.data) {
              stopCamera();
              void handleDecodePayload(code.data);
              return;
            }
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setCameraError(
        "Kamera tidak tersedia atau izin ditolak. Gunakan Unggah Galeri QR atau pilih salah satu Merchant Demo."
      );
    }
  }

  function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height);
      if (code?.data) {
        void handleDecodePayload(code.data);
      } else {
        setError("Gambar tidak mengandung kode QRIS yang dapat dibaca.");
      }
    };
    img.src = URL.createObjectURL(file);
  }

  async function executePayment(txAuthToken: string) {
    if (!decoded || decoded.kind !== "QRIS") return;
    const numericAmount = parseInt(amountInput.replace(/\D/g, ""), 10);
    try {
      const tx = await apiFetch<ReceiptTransaction>("/api/v1/payments/qris/execute", {
        method: "POST",
        idempotencyKey: makeIdempotencyKey("qris"),
        body: JSON.stringify({
          inquiry_id: decoded.inquiryId,
          raw_qr_payload: rawPayload,
          source_wallet_id: selectedWalletId,
          amount: numericAmount,
          tx_auth_token: txAuthToken,
        }),
      });
      setPinModalOpen(false);
      setDecoded(null);
      setReceipt(tx);
      await loadWallets();
    } catch (err) {
      setPinModalOpen(false);
      setError(err instanceof Error ? err.message : "Pembayaran QRIS gagal.");
    }
  }

  const selectedWallet = wallets.find((w) => w.id === selectedWalletId) || null;
  const numericAmount = parseInt(amountInput.replace(/\D/g, ""), 10) || 0;
  const insufficientBalance = Boolean(
    selectedWallet && numericAmount > selectedWallet.balance
  );
  const walletLocked = Boolean(selectedWallet?.isLocked);
  const canPay =
    Boolean(decoded && decoded.kind === "QRIS") &&
    numericAmount >= 1000 &&
    Boolean(selectedWallet) &&
    !insufficientBalance &&
    !walletLocked;

  const merchantInitials = decoded?.merchantName
    ? decoded.merchantName
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "QR";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">
            {decoded ? "Konfirmasi Pembayaran" : "Scan & Bayar QRIS"}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Pindai QRIS statis maupun dinamis, unggah dari galeri, atau uji merchant demo.
          </p>
        </div>
        {decoded && (
          <button
            type="button"
            onClick={() => {
              setDecoded(null);
              setError(null);
            }}
            className="sk-btn"
          >
            <ArrowLeft className="w-4 h-4" />
            Pindai Ulang
          </button>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {error}
        </div>
      )}

      {!decoded ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Scanner & Upload */}
          <div className="sk-card lg:col-span-6 space-y-4">
            <h2 className="text-[17px] font-semibold">Pemindai Kamera &amp; Galeri</h2>

            <div className="rounded-[14px] border border-[var(--border)] bg-[var(--ground)] p-5 text-center">
              {cameraActive ? (
                <div className="space-y-3">
                  <video
                    ref={videoRef}
                    className="w-full max-h-[260px] rounded-[10px] bg-black object-cover"
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  <button type="button" onClick={stopCamera} className="sk-btn">
                    Hentikan Kamera
                  </button>
                </div>
              ) : (
                <div className="py-6 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent-ink)] flex items-center justify-center">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <p className="text-sm text-[var(--muted)]">
                    Arahkan kamera ke kode QRIS merchant atau unggah gambar QR dari galeri.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => void startCamera()}
                      className="sk-btn sk-btn-primary"
                    >
                      <Camera className="w-4 h-4" />
                      Buka Kamera
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="sk-btn"
                    >
                      <ImageUp className="w-4 h-4" />
                      Unggah Gambar QR
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleGalleryUpload}
                      className="hidden"
                    />
                  </div>
                  {cameraError && (
                    <p className="text-xs text-[var(--warning)] pt-1">{cameraError}</p>
                  )}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (rawPayload.trim()) void handleDecodePayload(rawPayload);
              }}
              className="space-y-2.5"
            >
              <label htmlFor="manual-qr" className="block text-sm font-medium">
                Atau Tempel Payload QRIS / EMVCo String
              </label>
              <div className="flex gap-2">
                <input
                  id="manual-qr"
                  type="text"
                  value={rawPayload}
                  onChange={(e) => setRawPayload(e.target.value)}
                  placeholder="00020101021126..."
                  className="sk-input font-mono-id text-xs"
                />
                <button
                  type="submit"
                  disabled={busy || !rawPayload.trim()}
                  className="sk-btn sk-btn-dark shrink-0"
                >
                  Decode
                </button>
              </div>
            </form>
          </div>

          {/* Preset Merchant QRIS */}
          <div className="sk-card lg:col-span-6 space-y-4">
            <div>
              <h2 className="text-[17px] font-semibold">Merchant QRIS Siap Uji</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Klik salah satu merchant atau unduh gambar QR untuk menguji pemindaian galeri.
              </p>
            </div>

            <div className="space-y-3">
              {DEMO_QRIS_MERCHANTS.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-[12px] border border-[var(--border)] flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {presetImages[m.id] ? (
                      <img
                        src={presetImages[m.id]}
                        alt={`QRIS ${m.label}`}
                        className="w-16 h-16 rounded-[8px] border border-[var(--border)] shrink-0 bg-white p-1"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-[8px] bg-[var(--ground)] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{m.label}</p>
                      <span className="sk-pill sk-pill-accent mt-1">{m.badge}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDecodePayload(m.payload)}
                    className="sk-btn sk-btn-primary shrink-0"
                  >
                    Scan QR Ini
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : decoded.kind === "PROFILE" ? (
        <div className="sk-card max-w-[520px] space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-[var(--positive)]" />
            <div>
              <h2 className="text-base font-semibold">QR Profil SakuKilat Terdeteksi</h2>
              <p className="text-sm text-[var(--muted)]">
                {decoded.maskedName} ({decoded.phoneNumber})
              </p>
            </div>
          </div>
          <a
            href={`/transfer?phone=${encodeURIComponent(decoded.phoneNumber || "")}`}
            className="sk-btn sk-btn-primary w-full"
          >
            Lanjutkan ke Transfer Sesama SakuKilat
          </a>
        </div>
      ) : (
        /* PRD Section 6 Wireframe: Konfirmasi Pembayaran QRIS */
        <div className="max-w-[540px] mx-auto sk-card space-y-5">
          <div className="text-center space-y-2 pb-4 border-b border-[var(--rule)]">
            <div className="w-14 h-14 mx-auto rounded-[14px] bg-[var(--accent-soft)] text-[var(--accent-ink)] flex items-center justify-center text-lg font-semibold">
              {merchantInitials}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{decoded.merchantName}</h2>
              <p className="text-sm text-[var(--muted)] flex items-center justify-center gap-1.5 mt-0.5">
                <Store className="w-3.5 h-3.5" />
                {decoded.merchantCity} · NMID {decoded.nmid}
              </p>
            </div>
            <span className="sk-pill sk-pill-accent">
              {decoded.isDynamic ? "QRIS Dinamis (Nominal Terkunci)" : "QRIS Statis"}
            </span>
          </div>

          <div>
            <label htmlFor="qris-amount" className="block text-sm font-medium mb-1.5">
              Nominal Pembayaran
            </label>
            <div className="flex items-center h-11 px-3.5 border border-[var(--control)] rounded-[10px] bg-[var(--surface)] focus-within:outline-2 focus-within:outline-[var(--accent)]">
              <span className="text-base font-semibold text-[var(--muted)] mr-2 select-none">
                Rp
              </span>
              <input
                id="qris-amount"
                type="text"
                inputMode="numeric"
                value={amountInput}
                readOnly={Boolean(decoded.isDynamic && decoded.amount)}
                onChange={(e) => setAmountInput(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-transparent border-0 outline-none text-xl font-semibold num text-[var(--text)]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="qris-source-wallet" className="block text-sm font-medium mb-1.5">
              Sumber Dana
            </label>
            <select
              id="qris-source-wallet"
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              className="sk-input"
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — Saldo: {formatRupiah(w.balance)}
                  {w.isLocked ? " (Terkunci)" : ""}
                </option>
              ))}
            </select>
            {insufficientBalance && (
              <p className="mt-1.5 text-xs font-medium text-[var(--negative)]">
                Saldo pada {selectedWallet?.name} tidak mencukupi. Pilih sumber dana lain atau
                lakukan Top Up.
              </p>
            )}
            {walletLocked && (
              <p className="mt-1.5 text-xs font-medium text-[var(--warning)]">
                Kantong ini sedang dikunci. Buka kunci di halaman Kantong Pintar terlebih dahulu.
              </p>
            )}
          </div>

          <div className="p-4 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-2 text-sm">
            <p className="font-medium text-[var(--muted)]">Rincian</p>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Nominal Transaksi</span>
              <span className="num font-medium">{formatRupiah(numericAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Biaya Admin</span>
              <span className="num font-medium text-[var(--positive)]">Rp 0</span>
            </div>
            <div className="pt-2 border-t border-[var(--border)] flex justify-between font-semibold text-base">
              <span>Total Bayar</span>
              <span className="num text-[var(--accent)]">{formatRupiah(numericAmount)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={!canPay}
            onClick={() => setPinModalOpen(true)}
            className="sk-btn sk-btn-primary w-full min-h-[48px] text-base"
          >
            Bayar Sekarang (PIN)
          </button>
        </div>
      )}

      <PinAuthModal
        open={pinModalOpen}
        title="Otorisasi Pembayaran QRIS"
        amount={numericAmount}
        biometricEnabled={profile?.user.biometric_enabled}
        onClose={() => setPinModalOpen(false)}
        onAuthorized={executePayment}
      />

      <ReceiptModal tx={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
