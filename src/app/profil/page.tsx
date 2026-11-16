"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Camera, CheckCircle2, Fingerprint, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import { formatRupiah } from "@/components/Formatters";

export default function ProfilPage() {
  const router = useRouter();
  const { profile, refreshSession } = useSession();

  const [nik, setNik] = useState("");
  const [fullNameKtp, setFullNameKtp] = useState("");
  const [ktpImage, setKtpImage] = useState("/sandbox/ktp-upload.png");
  const [selfieImage, setSelfieImage] = useState("/sandbox/selfie-liveness.png");
  const [livenessPassed, setLivenessPassed] = useState(false);

  const [profileQrUrl, setProfileQrUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullNameKtp((prev) => prev || profile.user.full_name.toUpperCase());
    QRCode.toDataURL(`SAKUKILAT:USER:${profile.user.phone_number}`, {
      width: 180,
      margin: 1,
    }).then(setProfileQrUrl);
  }, [profile]);

  async function handleToggleBiometric() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/v1/auth/biometric", {
        method: "POST",
        body: JSON.stringify({
          action: "toggle",
          enabled: !profile.user.biometric_enabled,
        }),
      });
      await refreshSession();
      setMessage(
        !profile.user.biometric_enabled
          ? "Otorisasi Biometrik (Sidik Jari / Face ID) diaktifkan."
          : "Otorisasi Biometrik dinonaktifkan."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah pengaturan biometrik.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitKyc(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/api/v1/kyc", {
        method: "POST",
        body: JSON.stringify({
          nik,
          full_name_ktp: fullNameKtp,
          ktp_image_url: ktpImage,
          selfie_image_url: selfieImage,
          liveness_passed: livenessPassed,
        }),
      });
      setMessage(
        "Dokumen e-KTP terenkripsi AES-256 dan verifikasi liveness terkirim. Anda dapat meninjaunya di menu Admin & Ledger."
      );
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengajuan KYC gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("sakukilat_logged_out", "1");
    }
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    await refreshSession();
    router.push("/auth");
  }

  if (!profile) {
    return (
      <div className="sk-card p-8 text-center">
        <p className="text-sm text-[var(--muted)]">Memuat profil pengguna...</p>
      </div>
    );
  }

  const isVerified = profile.user.kyc_status === "VERIFIED";
  const isPending = profile.user.kyc_status === "PENDING";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">
            Profil, Keamanan &amp; Verifikasi KYC
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Kelola status e-KTP, otorisasi biometrik, device binding, dan QR profil terima dana.
          </p>
        </div>
        <button type="button" onClick={() => void handleLogout()} className="sk-btn">
          <LogOut className="w-4 h-4" />
          Keluar Akun
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3.5 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Account & QR Profile Card */}
        <div className="sk-card lg:col-span-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{profile.user.full_name}</h2>
              <p className="text-sm text-[var(--muted)] font-mono-id">
                {profile.user.phone_number}
              </p>
            </div>
            <span
              className={`sk-pill ${
                isVerified ? "sk-pill-pos" : isPending ? "sk-pill-warn" : "sk-pill-neutral"
              }`}
            >
              {profile.user.kyc_status}
            </span>
          </div>

          <div className="p-4 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Limit Saldo Maksimal</span>
              <span className="font-semibold num">{formatRupiah(profile.balanceLimit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Transfer Bank BI-FAST</span>
              <span className="font-medium">
                {isVerified ? "Aktif (10x gratis/bln)" : "Butuh KYC Verified"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Perangkat Aktif (Device Binding)</span>
              <span className="font-mono-id text-xs flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5" />
                {profile.user.active_device_id || "web-primary"}
              </span>
            </div>
          </div>

          {/* Biometric Toggle */}
          <div className="p-4 rounded-[12px] border border-[var(--border)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[9px] bg-[var(--accent-soft)] text-[var(--accent-ink)] flex items-center justify-center">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Biometrik (Face ID / Sidik Jari)</p>
                <p className="text-xs text-[var(--muted)]">
                  Otorisasi cepat saat konfirmasi PIN transaksi
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleToggleBiometric()}
              className={`px-3.5 h-9 rounded-[8px] text-xs font-semibold border ${
                profile.user.biometric_enabled
                  ? "bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] border-transparent"
                  : "bg-[var(--surface)] border-[var(--control)] text-[var(--text)]"
              }`}
            >
              {profile.user.biometric_enabled ? "Aktif" : "Nonaktif"}
            </button>
          </div>

          {/* Profile QR for P2P */}
          {profileQrUrl && (
            <div className="pt-2 border-t border-[var(--rule)] flex items-center gap-4">
              <img
                src={profileQrUrl}
                alt="QR Profil SakuKilat"
                className="w-24 h-24 rounded-[10px] border border-[var(--border)] p-1 bg-white"
              />
              <div>
                <p className="text-sm font-semibold">QR Profil Terima Dana (P2P)</p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Teman dapat memindai kode ini dari menu Scan QRIS untuk langsung transfer
                  bebas biaya admin ke akun Anda.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* KYC Upgrade Form */}
        <div className="sk-card lg:col-span-7 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="text-[17px] font-semibold">Upgrade Akun (Verifikasi e-KTP &amp; Liveness)</h2>
          </div>

          {isVerified ? (
            <div className="p-5 rounded-[12px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] space-y-1.5">
              <p className="font-semibold">Akun Anda Sudah Terverifikasi (KYC Verified)</p>
              <p className="text-sm">
                Batas saldo Rp 20.000.000 dan akses penuh transfer antar-bank BI-FAST telah aktif.
                Data NIK Anda disimpan terenkripsi dengan AES-256-GCM.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitKyc} className="space-y-4">
              {isPending && (
                <div className="p-3.5 rounded-[10px] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] text-sm">
                  Dokumen KYC Anda berstatus <strong>PENDING</strong>. Anda dapat langsung
                  menyetujuinya melalui panel <strong>Admin &amp; Ledger</strong>.
                </div>
              )}

              <div>
                <label htmlFor="kyc-nik" className="block text-sm font-medium mb-1">
                  Nomor Induk Kependudukan (NIK 16 Digit)
                </label>
                <input
                  id="kyc-nik"
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={nik}
                  onChange={(e) => setNik(e.target.value.replace(/\D/g, "").slice(0, 16))}
                  placeholder="Contoh: 3174011205980007"
                  className="sk-input font-mono-id"
                  required
                />
                <p className="text-xs text-[var(--faint)] mt-1">
                  NIK dienkripsi dengan AES-256-GCM &amp; diindeks dengan hash SHA-256.
                </p>
              </div>

              <div>
                <label htmlFor="kyc-name" className="block text-sm font-medium mb-1">
                  Nama Lengkap Sesuai e-KTP
                </label>
                <input
                  id="kyc-name"
                  type="text"
                  value={fullNameKtp}
                  onChange={(e) => setFullNameKtp(e.target.value)}
                  className="sk-input"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-[10px] border border-[var(--border)] bg-[var(--ground)] space-y-2">
                  <p className="text-xs font-semibold">1. Unggah Foto e-KTP</p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setKtpImage(`uploaded://${file.name}`);
                    }}
                    className="text-xs w-full"
                  />
                  <p className="text-[11px] text-[var(--muted)] truncate">Berkas: {ktpImage}</p>
                </div>

                <div className="p-3.5 rounded-[10px] border border-[var(--border)] bg-[var(--ground)] space-y-2">
                  <p className="text-xs font-semibold">2. Verifikasi Wajah (Liveness)</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLivenessPassed(true);
                      setSelfieImage(`liveness://verified-${Date.now()}.jpg`);
                    }}
                    className={`sk-btn w-full min-h-[36px] text-xs ${
                      livenessPassed ? "sk-btn-primary" : ""
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {livenessPassed ? "Liveness Wajah Lolos (98.8%)" : "Jalankan Cek Liveness"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || !livenessPassed || nik.length !== 16}
                className="sk-btn sk-btn-primary w-full min-h-[44px]"
              >
                {busy ? "Mengirim Dokumen Terenkripsi..." : "Ajukan Upgrade KYC"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

