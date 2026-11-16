"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, MessageSquare, Shield, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSession } from "@/components/AppShell";
import { SakuLogo } from "@/components/SakuLogo";

type AuthTab = "LOGIN_PIN" | "REGISTER_OTP";

export default function AuthPage() {
  const router = useRouter();
  const { demoUsers, switchDemoUser, refreshSession } = useSession();

  const [tab, setTab] = useState<AuthTab>("LOGIN_PIN");
  const [phone, setPhone] = useState("+6285211223344");
  const [pin, setPin] = useState("123456");

  // OTP Registration flow states
  const [channel, setChannel] = useState<"WHATSAPP" | "SMS">("WHATSAPP");
  const [step, setStep] = useState<"PHONE" | "OTP" | "PIN">("PHONE");
  const [otpCode, setOtpCode] = useState("");
  const [sandboxOtp, setSandboxOtp] = useState<string | null>(null);
  const [regToken, setRegToken] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [newPin, setNewPin] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handlePinLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("sakukilat_logged_out");
      }
      await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone_number: phone, pin }),
      });
      await refreshSession();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await apiFetch<{
        phone_number: string;
        expires_in_seconds: number;
        sandbox_otp?: string;
      }>("/api/v1/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone_number: phone, channel }),
      });
      setSandboxOtp(res.sandbox_otp || null);
      setInfo(
        `Kode OTP 6-digit terkirim via ${channel} ke ${res.phone_number} (berlaku ${res.expires_in_seconds} detik). Salah OTP 3x memblokir nomor 15 menit.`
      );
      setStep("OTP");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal meminta OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        verified: boolean;
        registration_token?: string;
      }>("/api/v1/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({
          phone_number: phone,
          otp_code: otpCode,
          purpose: "REGISTER",
        }),
      });
      if (!res.registration_token) {
        throw new Error("Token registrasi tidak diterima.");
      }
      setRegToken(res.registration_token);
      setStep("PIN");
      setInfo("Nomor HP terverifikasi. Lengkapi nama dan buat 6-digit PIN keamanan.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verifikasi OTP gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteRegistration(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("sakukilat_logged_out");
      }
      await apiFetch("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          phone_number: phone,
          full_name: fullName,
          email,
          pin: newPin,
          registration_token: regToken,
        }),
      });
      await refreshSession();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registrasi gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[920px] grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="sk-card md:col-span-7">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <SakuLogo size={32} />
              <div>
                <h1 className="text-xl font-semibold">Masuk atau Daftar SakuKilat</h1>
                <p className="text-xs text-[var(--muted)]">
                  Autentikasi nomor HP + OTP (WhatsApp/SMS) &amp; PIN 6-digit
                </p>
              </div>
            </div>
            <Link href="/" className="sk-btn text-xs min-h-[34px] px-3">
              <ArrowLeft className="w-3.5 h-3.5" />
              Beranda
            </Link>
          </div>

          <div className="mt-4 flex gap-2 p-1 rounded-[10px] bg-[var(--ground)]">
            <button
              type="button"
              onClick={() => {
                setTab("LOGIN_PIN");
                setError(null);
              }}
              className={`flex-1 h-9 rounded-[8px] text-sm font-medium transition-colors ${
                tab === "LOGIN_PIN"
                  ? "bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]"
                  : "text-[var(--muted)]"
              }`}
            >
              Masuk dengan PIN
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("REGISTER_OTP");
                setPhone("");
                setStep("PHONE");
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 h-9 rounded-[8px] text-sm font-medium transition-colors ${
                tab === "REGISTER_OTP"
                  ? "bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]"
                  : "text-[var(--muted)]"
              }`}
            >
              Daftar Akun Baru (OTP)
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm">
              {error}
            </div>
          )}

          {info && (
            <div className="mt-4 p-3 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-ink)] text-sm">
              {info}
            </div>
          )}

          {tab === "LOGIN_PIN" ? (
            <form onSubmit={handlePinLogin} className="mt-5 space-y-4">
              <div>
                <label htmlFor="login-phone" className="block text-sm font-medium mb-1.5">
                  Nomor HP Terdaftar
                </label>
                <input
                  id="login-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="085211223344"
                  className="sk-input num"
                  required
                />
              </div>
              <div>
                <label htmlFor="login-pin" className="block text-sm font-medium mb-1.5">
                  PIN Keamanan (6 Digit)
                </label>
                <input
                  id="login-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6 digit PIN (demo: 123456)"
                  className="sk-input num tracking-widest"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="sk-btn sk-btn-primary w-full min-h-[44px]"
              >
                <KeyRound className="w-4 h-4" />
                {busy ? "Memverifikasi..." : "Masuk ke Dompet"}
              </button>
            </form>
          ) : (
            <div className="mt-5">
              {step === "PHONE" && (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div>
                    <label htmlFor="reg-phone" className="block text-sm font-medium mb-1.5">
                      Nomor HP Aktif
                    </label>
                    <input
                      id="reg-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Contoh: 089912345678"
                      className="sk-input num"
                      required
                    />
                  </div>
                  <div>
                    <span className="block text-sm font-medium mb-1.5">
                      Kanal Pengiriman OTP
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      {(["WHATSAPP", "SMS"] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setChannel(c)}
                          className={`h-10 rounded-[10px] border text-sm font-medium ${
                            channel === c
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                              : "border-[var(--control)] bg-[var(--surface)]"
                          }`}
                        >
                          {c === "WHATSAPP" ? "WhatsApp" : "SMS Reguler"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="sk-btn sk-btn-primary w-full min-h-[44px]"
                  >
                    <MessageSquare className="w-4 h-4" />
                    {busy ? "Mengirim OTP..." : "Kirim Kode OTP 6-Digit"}
                  </button>
                </form>
              )}

              {step === "OTP" && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  {sandboxOtp && (
                    <div className="p-3 rounded-[10px] border border-[#bfe1ff] bg-[var(--raised)] text-xs">
                      <span className="text-[var(--muted)]">Sandbox OTP Preview: </span>
                      <strong className="font-mono-id text-sm text-[var(--accent-ink)]">
                        {sandboxOtp}
                      </strong>
                    </div>
                  )}
                  <div>
                    <label htmlFor="otp-code" className="block text-sm font-medium mb-1.5">
                      Masukkan Kode OTP (Berlaku 180 detik)
                    </label>
                    <input
                      id="otp-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6 digit angka"
                      className="sk-input num text-center tracking-widest"
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStep("PHONE")}
                      className="sk-btn flex-1"
                    >
                      Ubah Nomor
                    </button>
                    <button
                      type="submit"
                      disabled={busy || otpCode.length !== 6}
                      className="sk-btn sk-btn-primary flex-1"
                    >
                      {busy ? "Memeriksa..." : "Verifikasi OTP"}
                    </button>
                  </div>
                </form>
              )}

              {step === "PIN" && (
                <form onSubmit={handleCompleteRegistration} className="space-y-4">
                  <div>
                    <label htmlFor="reg-name" className="block text-sm font-medium mb-1.5">
                      Nama Lengkap
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Sesuai identitas Anda"
                      className="sk-input"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-email" className="block text-sm font-medium mb-1.5">
                      Email (Opsional)
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@domain.id"
                      className="sk-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-pin" className="block text-sm font-medium mb-1.5">
                      Buat 6-Digit PIN Keamanan
                    </label>
                    <input
                      id="reg-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6 digit angka"
                      className="sk-input num tracking-widest"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || newPin.length !== 6}
                    className="sk-btn sk-btn-primary w-full min-h-[44px]"
                  >
                    <UserPlus className="w-4 h-4" />
                    {busy ? "Membuat Dompet..." : "Aktifkan Akun & Dompet Utama"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Persona Quick Switch Panel for Evaluator */}
        <div className="sk-card md:col-span-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-[16px] font-semibold">Akun Demo PRD (PIN: 123456)</h2>
          </div>
          <p className="text-xs text-[var(--muted)] mb-4">
            Pilih salah satu persona dari dokumen PRD untuk langsung menguji skenario saldo,
            limit KYC Rp2 Juta vs Rp20 Juta, UMKM, atau Audit Compliance.
          </p>
          <div className="space-y-2">
            {demoUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={async () => {
                  await switchDemoUser(u.id);
                  router.push("/");
                }}
                className="w-full p-3 rounded-[10px] border border-[var(--border)] hover:bg-[var(--raised)] text-left flex items-center justify-between gap-2 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name}</p>
                  <p className="text-xs text-[var(--muted)] font-mono-id">{u.phone_number}</p>
                </div>
                <span
                  className={`sk-pill ${
                    u.kyc_status === "VERIFIED" ? "sk-pill-pos" : "sk-pill-neutral"
                  }`}
                >
                  {u.role === "ADMIN"
                    ? "ADMIN"
                    : u.role === "MERCHANT"
                    ? "UMKM"
                    : u.kyc_status}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

