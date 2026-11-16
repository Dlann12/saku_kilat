"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Bell,
  History,
  Home,
  Menu,
  QrCode,
  ShieldCheck,
  Store,
  User,
  Users,
  Wallet,
  X,
  Zap,
  ChevronDown,
  LogIn,
} from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { SakuLogo } from "./SakuLogo";

export interface DemoUserSummary {
  id: string;
  phone_number: string;
  full_name: string;
  kyc_status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  role: string;
}

export interface ProfileSummary {
  user: DemoUserSummary & {
    email: string | null;
    biometric_enabled: boolean;
    active_device_id: string | null;
  };
  balanceLimit: number;
  latestKyc: {
    id: string;
    full_name_ktp: string;
    status: string;
    rejection_reason: string | null;
  } | null;
  notifications: Array<{
    id: string;
    channel: string;
    title: string;
    body: string;
    is_read: boolean;
    created_at: string;
  }>;
}

interface SessionContextValue {
  profile: ProfileSummary | null;
  demoUsers: DemoUserSummary[];
  loading: boolean;
  refreshSession: () => Promise<void>;
  switchDemoUser: (userId: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  profile: null,
  demoUsers: [],
  loading: true,
  refreshSession: async () => {},
  switchDemoUser: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

const NAV_PRIMARY = [
  { href: "/", label: "Beranda", icon: Home },
  { href: "/riwayat", label: "Riwayat", icon: History },
  { href: "/qris", label: "Scan & Bayar QRIS", icon: QrCode },
  { href: "/pockets", label: "Kantong Pintar", icon: Wallet },
  { href: "/transfer", label: "Transfer Dana", icon: ArrowLeftRight },
  { href: "/ppob", label: "Bayar & Beli PPOB", icon: Zap },
];

const NAV_SECONDARY = [
  { href: "/split-bill", label: "Patungan (Split Bill)", icon: Users },
  { href: "/merchant", label: "SakuKilat Bisnis", icon: Store },
  { href: "/admin", label: "Admin & Ledger", icon: ShieldCheck },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [demoUsers, setDemoUsers] = useState<DemoUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const demos = await apiFetch<DemoUserSummary[]>("/api/v1/auth/demo-switch").catch(
        () => []
      );
      setDemoUsers(demos);

      const sessionRes = await apiFetch<{
        authenticated: boolean;
        profile: ProfileSummary | null;
      }>("/api/v1/auth/session");

      if (sessionRes.authenticated && sessionRes.profile) {
        setProfile(sessionRes.profile);
      } else {
        // Auto-bootstrap Demo Dlan session unless user explicitly navigated to /auth
        const loggedOutFlag =
          typeof window !== "undefined" &&
          window.sessionStorage.getItem("sakukilat_logged_out") === "1";

        if (!loggedOutFlag && pathname !== "/auth" && demos.length > 0) {
          const dlan = demos.find((d) => d.full_name.includes("Dlan")) || demos[0];
          await apiFetch("/api/v1/auth/demo-switch", {
            method: "POST",
            body: JSON.stringify({ user_id: dlan.id }),
          });
          const me = await apiFetch<{
            authenticated: boolean;
            profile: ProfileSummary | null;
          }>("/api/v1/auth/session");
          setProfile(me.profile);
        } else {
          setProfile(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function switchDemoUser(userId: string) {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("sakukilat_logged_out");
    }
    await apiFetch("/api/v1/auth/demo-switch", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
    await loadSession();
    router.refresh();
  }

  async function markNotificationsRead() {
    await apiFetch("/api/v1/notifications/read", { method: "POST" }).catch(() => {});
    await loadSession();
  }

  const unreadCount = profile?.notifications.filter((n) => !n.is_read).length || 0;

  // On /auth page without active need for sidebar chrome if logged out, still wrap neatly
  const showFullChrome = pathname !== "/auth";

  const activeNavTitle =
    [...NAV_PRIMARY, ...NAV_SECONDARY, { href: "/profil", label: "Profil & KYC" }, { href: "/topup", label: "Top Up Saldo" }].find(
      (n) => n.href === pathname
    )?.label || "SakuKilat";

  return (
    <SessionContext.Provider
      value={{
        profile,
        demoUsers,
        loading,
        refreshSession: loadSession,
        switchDemoUser,
      }}
    >
      {!showFullChrome ? (
        <div className="min-h-screen bg-[var(--ground)]">{children}</div>
      ) : (
        <div className="sk-shell">
          {/* Desktop Open-Plane Sidebar */}
          <aside className="sk-sidebar" aria-label="Navigasi utama">
            <div className="flex items-center gap-2.5 px-2 pb-4">
              <SakuLogo size={30} />
              <div>
                <p className="text-[15px] font-semibold tracking-tight leading-tight">
                  SakuKilat
                </p>
                <p className="text-[11px] text-[var(--faint)]">Dompet Digital</p>
              </div>
            </div>

            {/* Persona / Account Switcher */}
            {demoUsers.length > 0 && (
              <div className="mb-4 px-1">
                <label
                  htmlFor="desktop-persona-select"
                  className="block text-[11px] font-medium text-[var(--faint)] mb-1 px-1"
                >
                  Akun Aktif (Demo Persona)
                </label>
                <div className="relative">
                  <select
                    id="desktop-persona-select"
                    value={profile?.user.id || ""}
                    onChange={(e) => {
                      if (e.target.value) void switchDemoUser(e.target.value);
                    }}
                    className="w-full h-9 pl-2.5 pr-7 text-[13px] font-medium bg-[var(--surface)] border border-[var(--border)] rounded-[9px] appearance-none cursor-pointer"
                  >
                    {demoUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.kyc_status === "VERIFIED" ? "KYC" : "Basic"})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            <nav className="space-y-0.5">
              {NAV_PRIMARY.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] transition-colors ${
                      active
                        ? "bg-[var(--active)] text-[var(--text)] font-medium"
                        : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.6} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}

              <p className="mt-5 mb-1.5 px-2.5 text-[12px] text-[var(--faint)]">
                Layanan &amp; Pengawasan
              </p>

              {NAV_SECONDARY.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] transition-colors ${
                      active
                        ? "bg-[var(--active)] text-[var(--text)] font-medium"
                        : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.6} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto pt-4 border-t border-[var(--border)] space-y-1">
              <button
                type="button"
                onClick={() => setNotifOpen(true)}
                className="w-full flex items-center justify-between h-9 px-2.5 rounded-[8px] text-[14px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                <span className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4" strokeWidth={1.6} />
                  Notifikasi
                </span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[11px] font-semibold rounded-full bg-[var(--accent)] text-white num">
                    {unreadCount}
                  </span>
                )}
              </button>
              <Link
                href="/profil"
                aria-current={pathname === "/profil" ? "page" : undefined}
                className={`flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] transition-colors ${
                  pathname === "/profil"
                    ? "bg-[var(--active)] text-[var(--text)] font-medium"
                    : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                }`}
              >
                <User className="w-4 h-4 shrink-0" strokeWidth={1.6} />
                <span className="truncate">Profil &amp; KYC</span>
              </Link>
              <Link
                href="/auth"
                className="flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] text-[14px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                <LogIn className="w-4 h-4 shrink-0" strokeWidth={1.6} />
                <span>Daftar / Login OTP</span>
              </Link>
            </div>
          </aside>

          {/* Main Column */}
          <div className="min-w-0">
            {/* Mobile Compact Top Header (<= 860px) */}
            <header className="sk-mobile-header">
              <div className="flex items-center gap-2.5">
                <SakuLogo size={24} />
                <span className="font-semibold text-[15px]">{activeNavTitle}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setNotifOpen(true)}
                  className="relative w-11 h-11 flex items-center justify-center rounded-[10px] text-[var(--text)]"
                  aria-label="Buka notifikasi"
                >
                  <Bell className="w-5 h-5" strokeWidth={1.6} />
                  {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--accent)]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="w-11 h-11 flex items-center justify-center rounded-[10px] text-[var(--text)]"
                  aria-label="Buka menu layanan"
                >
                  <Menu className="w-5 h-5" strokeWidth={1.6} />
                </button>
              </div>
            </header>

            <main className="sk-canvas">
              <div className="sk-container">{children}</div>
            </main>
          </div>

          {/* Mobile One-Thumb Bottom Navigation Bar (5 PRD Destinations) */}
          <nav className="sk-bottom-nav" aria-label="Navigasi bawah mobile">
            <Link
              href="/"
              className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium ${
                pathname === "/" ? "text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
            >
              <Home className="w-5 h-5" strokeWidth={1.7} />
              <span>Beranda</span>
            </Link>

            <Link
              href="/riwayat"
              className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium ${
                pathname === "/riwayat" ? "text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
            >
              <History className="w-5 h-5" strokeWidth={1.7} />
              <span>Riwayat</span>
            </Link>

            <Link
              href="/qris"
              className="flex flex-col items-center justify-end pb-0.5"
              aria-label="Scan & Bayar QRIS"
            >
              <span className="w-12 h-12 -mt-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center border-4 border-[var(--surface)]">
                <QrCode className="w-5 h-5" strokeWidth={1.9} />
              </span>
              <span className="text-[11px] font-semibold text-[var(--accent)] mt-0.5">
                QRIS
              </span>
            </Link>

            <Link
              href="/pockets"
              className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium ${
                pathname === "/pockets" ? "text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
            >
              <Wallet className="w-5 h-5" strokeWidth={1.7} />
              <span>Kantong</span>
            </Link>

            <Link
              href="/profil"
              className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium ${
                pathname === "/profil" ? "text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
            >
              <User className="w-5 h-5" strokeWidth={1.7} />
              <span>Profil</span>
            </Link>
          </nav>

          {/* Mobile Drawer Menu (Secondary Routes + Persona Switcher) */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 bg-black/35 flex justify-end">
              <div className="w-full max-w-[320px] h-full bg-[var(--surface)] p-5 overflow-y-auto">
                <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <SakuLogo size={26} />
                    <span className="font-semibold">Menu SakuKilat</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-10 h-10 flex items-center justify-center rounded-[8px] text-[var(--muted)]"
                    aria-label="Tutup menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {demoUsers.length > 0 && (
                  <div className="mt-4">
                    <label
                      htmlFor="mobile-persona-select"
                      className="block text-xs font-medium text-[var(--muted)] mb-1.5"
                    >
                      Ganti Akun Demo
                    </label>
                    <select
                      id="mobile-persona-select"
                      value={profile?.user.id || ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          void switchDemoUser(e.target.value);
                          setMobileMenuOpen(false);
                        }
                      }}
                      className="sk-input text-sm"
                    >
                      {demoUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.kyc_status})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mt-5 space-y-1">
                  {[...NAV_PRIMARY, ...NAV_SECONDARY, { href: "/topup", label: "Top Up Saldo", icon: Wallet }, { href: "/profil", label: "Profil & KYC", icon: User }, { href: "/auth", label: "Daftar / Login OTP", icon: LogIn }].map(
                    (item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 min-h-[44px] px-3 rounded-[10px] text-sm ${
                            pathname === item.href
                              ? "bg-[var(--active)] font-medium text-[var(--text)]"
                              : "text-[var(--muted)]"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    }
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Notifications Sheet (also shows Sandbox OTP previews!) */}
          {notifOpen && (
            <div className="fixed inset-0 z-50 bg-black/35 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div
                className="w-full sm:max-w-[460px] max-h-[80vh] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-t-[20px] sm:rounded-[20px] p-5"
                style={{ boxShadow: "0 12px 32px rgba(27,29,31,0.14)" }}
              >
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                  <div>
                    <h2 className="text-[17px] font-semibold">Pusat Notifikasi</h2>
                    <p className="text-xs text-[var(--muted)]">
                      Alert transaksi, KYC, patungan &amp; kotak masuk OTP sandbox
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void markNotificationsRead()}
                        className="text-xs font-medium text-[var(--accent)] px-2 py-1 rounded-[6px] hover:bg-[var(--raised)]"
                      >
                        Tandai terbaca
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="w-9 h-9 flex items-center justify-center rounded-[8px] text-[var(--muted)] hover:bg-[var(--raised)]"
                      aria-label="Tutup notifikasi"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 overflow-y-auto divide-y divide-[var(--rule)]">
                  {!profile || profile.notifications.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--muted)]">
                      Belum ada notifikasi baru.
                    </p>
                  ) : (
                    profile.notifications.map((n) => (
                      <div key={n.id} className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-[var(--text)]">{n.title}</p>
                          <span className="sk-pill sk-pill-neutral">{n.channel}</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">
                          {n.body}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </SessionContext.Provider>
  );
}
