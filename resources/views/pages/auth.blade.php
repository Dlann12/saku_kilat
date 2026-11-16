<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="theme-color" content="#F3F5F7">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600&display=swap" rel="stylesheet">
    <title>Masuk &amp; Daftar OTP — SakuKilat</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="min-h-screen bg-[var(--ground)] text-[var(--text)] px-4 py-8">
<div class="max-w-[920px] mx-auto">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div class="flex items-center gap-3">
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect width="32" height="32" rx="9" fill="#1D5FD6" />
                <path d="M17.5 6.5L10 17.5H16L14.5 25.5L22 14.5H16L17.5 6.5Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1" stroke-linejoin="round" />
            </svg>
            <div>
                <h1 class="text-xl font-semibold tracking-tight leading-tight">SakuKilat</h1>
                <p class="text-xs text-[var(--muted)]">Transaksi Cepat, Kelola Uang Tanpa Ribet</p>
            </div>
        </div>
        <a href="{{ route('home') }}" class="sk-btn">Kembali ke Beranda</a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <section class="sk-card lg:col-span-7">
            <div class="flex gap-2 p-1 rounded-[12px] bg-[var(--ground)] border border-[var(--border)] mb-5">
                <button type="button" id="tab-btn-login" class="flex-1 h-9 rounded-[9px] text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]">
                    Masuk (PIN)
                </button>
                <button type="button" id="tab-btn-register" class="flex-1 h-9 rounded-[9px] text-sm font-medium text-[var(--muted)]">
                    Daftar Akun Baru (OTP)
                </button>
            </div>

            <div id="auth-error" class="hidden mb-4 p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"></div>
            <div id="auth-info" class="hidden mb-4 p-3 rounded-[10px] bg-[var(--pill-accent-bg)] text-[var(--accent-ink)] text-sm"></div>

            {{-- Panel 1: Login PIN --}}
            <form id="form-login" class="space-y-4">
                <div>
                    <label for="login-phone" class="block text-xs font-medium text-[var(--muted)] mb-1.5">Nomor HP Terdaftar</label>
                    <input id="login-phone" type="tel" value="+6285211223344" placeholder="+62812..." required class="sk-input" />
                </div>
                <div>
                    <label for="login-pin" class="block text-xs font-medium text-[var(--muted)] mb-1.5">PIN Keamanan 6-Digit</label>
                    <input id="login-pin" type="password" inputmode="numeric" maxlength="6" value="123456" placeholder="••••••" required class="sk-input num tracking-[0.25em]" />
                    <p class="mt-1 text-xs text-[var(--faint)]">PIN bawaan semua akun demo adalah <span class="font-mono-id">123456</span></p>
                </div>
                <div>
                    <label for="login-device" class="block text-xs font-medium text-[var(--muted)] mb-1.5">ID Perangkat (Device Binding)</label>
                    <input id="login-device" type="text" value="WEB-BROWSER-PRIMARY" class="sk-input font-mono-id text-xs" />
                </div>
                <button type="submit" id="btn-login-submit" class="w-full sk-btn sk-btn-primary">Masuk ke SakuKilat</button>
            </form>

            {{-- Panel 2: Register 3-Step OTP --}}
            <div id="panel-register" class="hidden space-y-5">
                <form id="form-otp-request" class="space-y-3 pb-4 border-b border-[var(--rule)]">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Langkah 1 — Kirim Kode OTP</span>
                        <span id="otp-countdown" class="text-xs text-[var(--muted)] num"></span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div class="sm:col-span-2">
                            <input id="reg-phone" type="tel" placeholder="+6285299887766" required class="sk-input" />
                        </div>
                        <select id="reg-channel" class="sk-input text-sm">
                            <option value="WHATSAPP">WhatsApp</option>
                            <option value="SMS">SMS</option>
                        </select>
                    </div>
                    <button type="submit" class="sk-btn w-full sm:w-auto">Kirim OTP (Berlaku 180 Detik)</button>
                </form>

                <form id="form-otp-verify" class="space-y-3 pb-4 border-b border-[var(--rule)]">
                    <span class="block text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Langkah 2 — Verifikasi Kode 6-Digit</span>
                    <div class="flex flex-col sm:flex-row gap-2.5">
                        <input id="reg-otp" type="text" inputmode="numeric" maxlength="6" placeholder="Masukkan 6 digit OTP" required class="sk-input font-mono-id tracking-widest" />
                        <button type="submit" class="sk-btn sk-btn-dark shrink-0">Verifikasi OTP</button>
                    </div>
                    <p class="text-xs text-[var(--faint)]">3x salah memasukkan OTP akan mengunci sementara selama 15 menit (anti brute-force).</p>
                </form>

                <form id="form-register-complete" class="space-y-3">
                    <span class="block text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Langkah 3 — Profil &amp; Buat PIN</span>
                    <input type="hidden" id="reg-token" value="" />
                    <div>
                        <label for="reg-name" class="block text-xs font-medium text-[var(--muted)] mb-1">Nama Lengkap</label>
                        <input id="reg-name" type="text" placeholder="Nama lengkap sesuai e-KTP" required class="sk-input" />
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label for="reg-email" class="block text-xs font-medium text-[var(--muted)] mb-1">Email (Opsional)</label>
                            <input id="reg-email" type="email" placeholder="nama@email.id" class="sk-input" />
                        </div>
                        <div>
                            <label for="reg-pin" class="block text-xs font-medium text-[var(--muted)] mb-1">Buat PIN 6-Digit</label>
                            <input id="reg-pin" type="password" inputmode="numeric" maxlength="6" placeholder="Contoh: 246810" required class="sk-input num tracking-[0.25em]" />
                        </div>
                    </div>
                    <button type="submit" id="btn-register-complete" disabled class="w-full sk-btn sk-btn-primary">
                        Selesaikan Pendaftaran &amp; Buka Dompet
                    </button>
                </form>
            </div>
        </section>

        {{-- Demo Persona Switcher --}}
        <aside class="sk-card lg:col-span-5">
            <h2 class="text-[16px] font-semibold">Akun Simulasi Cepat (Demo Persona)</h2>
            <p class="text-xs text-[var(--muted)] mt-1">Pilih salah satu akun terisi saldo &amp; riwayat untuk menguji peran pengguna, merchant UMKM, maupun admin kepatuhan.</p>

            <div class="mt-4 space-y-2.5">
                @foreach($demoPersonas as $p)
                    <form method="POST" action="{{ route('demo.switch') }}" class="p-3 rounded-[12px] border border-[var(--border)] bg-[var(--ground)] flex items-center justify-between gap-3">
                        @csrf
                        <input type="hidden" name="user_id" value="{{ $p->id }}" />
                        <input type="hidden" name="redirect_home" value="1" />
                        <div class="min-w-0">
                            <p class="text-sm font-semibold truncate">{{ $p->full_name }}</p>
                            <div class="flex items-center gap-2 mt-0.5">
                                <span class="font-mono-id text-xs text-[var(--muted)]">{{ $p->phone_number }}</span>
                                <span class="sk-pill {{ $p->kyc_status === 'VERIFIED' ? 'sk-pill-pos' : 'sk-pill-warn' }}">
                                    {{ $p->kyc_status === 'VERIFIED' ? 'KYC Verified' : 'Basic' }}
                                </span>
                            </div>
                        </div>
                        <button type="submit" class="sk-btn shrink-0 text-xs px-3 min-h-[34px]">Pakai Akun</button>
                    </form>
                @endforeach
            </div>
        </aside>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const errBox = document.getElementById('auth-error');
  const infoBox = document.getElementById('auth-info');
  const tabLogin = document.getElementById('tab-btn-login');
  const tabReg = document.getElementById('tab-btn-register');
  const formLogin = document.getElementById('form-login');
  const panelReg = document.getElementById('panel-register');

  function showErr(msg) {
    infoBox.classList.add('hidden');
    errBox.textContent = msg;
    errBox.classList.remove('hidden');
  }
  function showInfo(msg) {
    errBox.classList.add('hidden');
    infoBox.textContent = msg;
    infoBox.classList.remove('hidden');
  }

  tabLogin.addEventListener('click', () => {
    formLogin.classList.remove('hidden');
    panelReg.classList.add('hidden');
    tabLogin.className = 'flex-1 h-9 rounded-[9px] text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]';
    tabReg.className = 'flex-1 h-9 rounded-[9px] text-sm font-medium text-[var(--muted)]';
  });

  tabReg.addEventListener('click', () => {
    formLogin.classList.add('hidden');
    panelReg.classList.remove('hidden');
    tabReg.className = 'flex-1 h-9 rounded-[9px] text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]';
    tabLogin.className = 'flex-1 h-9 rounded-[9px] text-sm font-medium text-[var(--muted)]';
  });

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await window.SakuKilat.api('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: document.getElementById('login-phone').value.trim(),
          pin: document.getElementById('login-pin').value.trim(),
          device_id: document.getElementById('login-device').value.trim() || 'WEB-BROWSER-PRIMARY',
        }),
      });
      window.location.href = '{{ route("home") }}';
    } catch (err) {
      showErr(err.message);
    }
  });

  let timerHandle = null;
  document.getElementById('form-otp-request').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await window.SakuKilat.api('/api/v1/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: document.getElementById('reg-phone').value.trim(),
          channel: document.getElementById('reg-channel').value,
        }),
      });
      const preview = data.sandbox_otp_preview ? ` Kode OTP Sandbox: ${data.sandbox_otp_preview}` : '';
      showInfo(`Kode OTP dikirim via ${data.channel}.${preview}`);
      let left = Number(data.ttl_seconds || 180);
      const cdEl = document.getElementById('otp-countdown');
      if (timerHandle) clearInterval(timerHandle);
      timerHandle = setInterval(() => {
        left -= 1;
        cdEl.textContent = left > 0 ? `Sisa waktu: ${left}d` : 'Kedaluwarsa';
        if (left <= 0) clearInterval(timerHandle);
      }, 1000);
    } catch (err) {
      showErr(err.message);
    }
  });

  document.getElementById('form-otp-verify').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await window.SakuKilat.api('/api/v1/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: document.getElementById('reg-phone').value.trim(),
          otp_code: document.getElementById('reg-otp').value.trim(),
          purpose: 'REGISTER',
        }),
      });
      if (data.registration_token) {
        document.getElementById('reg-token').value = data.registration_token;
        document.getElementById('btn-register-complete').disabled = false;
        showInfo('OTP terverifikasi. Silakan isi nama lengkap dan buat PIN 6-digit.');
      }
    } catch (err) {
      showErr(err.message);
    }
  });

  document.getElementById('form-register-complete').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await window.SakuKilat.api('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: document.getElementById('reg-phone').value.trim(),
          full_name: document.getElementById('reg-name').value.trim(),
          email: document.getElementById('reg-email').value.trim() || null,
          pin: document.getElementById('reg-pin').value.trim(),
          registration_token: document.getElementById('reg-token').value,
          device_id: 'WEB-BROWSER-PRIMARY',
        }),
      });
      window.location.href = '{{ route("home") }}';
    } catch (err) {
      showErr(err.message);
    }
  });
});
</script>
</body>
</html>

