@extends('layouts.app')

@section('content')
<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Profil, Keamanan &amp; Verifikasi e-KTP</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">Kelola perangkat terikat, biometrik transaksi, dan upgrade SakuKilat Plus (Rp 20 juta)</p>
    </div>
    <a href="{{ route('home') }}" class="sk-btn">Beranda</a>
</div>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    <section class="sk-card lg:col-span-5 space-y-5">
        <div class="flex items-start justify-between gap-3">
            <div>
                <h2 class="text-lg font-semibold">{{ $currentUser->full_name }}</h2>
                <p class="font-mono-id text-xs text-[var(--muted)] mt-0.5">{{ $currentUser->phone_number }}</p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                    <span class="sk-pill {{ $currentUser->kyc_status === 'VERIFIED' ? 'sk-pill-pos' : 'sk-pill-warn' }}">
                        {{ $currentUser->kyc_status === 'VERIFIED' ? 'SakuKilat Plus' : $currentUser->kyc_status }}
                    </span>
                    <span class="sk-pill sk-pill-neutral">Limit {{ \App\Support\Format::rupiah($currentUser->balanceLimit()) }}</span>
                </div>
            </div>
        </div>

        <div class="p-4 rounded-[14px] border border-[var(--border)] bg-[var(--ground)] flex flex-col items-center text-center">
            <div class="bg-white p-2.5 rounded-[10px] border border-[var(--border)]">
                {!! $profileQrSvg !!}
            </div>
            <p class="text-xs font-medium mt-2.5">QR Terima Transfer P2P (Rp 0)</p>
            <p class="text-[11px] font-mono-id text-[var(--faint)] mt-0.5">SAKUKILAT:USER:{{ $currentUser->phone_number }}</p>
        </div>

        <div class="space-y-3 pt-2 border-t border-[var(--rule)]">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <p class="text-sm font-medium">Perangkat Terikat (Device Binding)</p>
                    <p class="font-mono-id text-xs text-[var(--muted)]">{{ $currentUser->device_id ?? 'WEB-BROWSER-PRIMARY' }}</p>
                </div>
                <span class="sk-pill sk-pill-pos">Aktif</span>
            </div>

            <div class="flex items-center justify-between gap-3">
                <div>
                    <p class="text-sm font-medium">Otorisasi Biometrik Cepat</p>
                    <p class="text-xs text-[var(--muted)]">Aktifkan tombol biometrik pada modal konfirmasi PIN</p>
                </div>
                <button
                    type="button"
                    id="bio-toggle-btn"
                    data-enabled="{{ $currentUser->biometric_enabled ? '1' : '0' }}"
                    class="sk-btn min-h-[34px] px-3 text-xs {{ $currentUser->biometric_enabled ? 'sk-btn-primary' : '' }}"
                >
                    {{ $currentUser->biometric_enabled ? 'Aktif' : 'Nonaktif' }}
                </button>
            </div>
        </div>

        <div class="pt-3 border-t border-[var(--rule)] flex flex-wrap gap-2.5">
            <a href="{{ route('auth') }}" class="sk-btn flex-1">Halaman Login / OTP</a>
            <form method="POST" action="{{ route('web.logout') }}" class="flex-1">
                @csrf
                <button type="submit" class="w-full sk-btn text-[var(--negative)]">Keluar Sesi</button>
            </form>
        </div>
    </section>

    <section class="sk-card lg:col-span-7 space-y-4">
        <div>
            <h2 class="text-[16px] font-semibold">Verifikasi Identitas e-KTP (Upgrade SakuKilat Plus)</h2>
            <p class="text-xs text-[var(--muted)] mt-0.5">NIK dienkripsi AES-256-CBC saat disimpan dan tidak pernah ditayangkan ulang secara utuh.</p>
        </div>

        @if($latestKyc)
            <div class="p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--ground)] space-y-1 text-sm">
                <div class="flex items-center justify-between gap-2">
                    <span class="font-medium">Pengajuan KYC Terakhir: {{ $latestKyc->full_name_ktp }}</span>
                    <span class="sk-pill {{ $latestKyc->status === 'VERIFIED' ? 'sk-pill-pos' : ($latestKyc->status === 'PENDING' ? 'sk-pill-warn' : 'sk-pill-neg') }}">
                        {{ $latestKyc->status }}
                    </span>
                </div>
                @if($latestKyc->rejection_reason)
                    <p class="text-xs text-[var(--negative)]">Alasan ditolak: {{ $latestKyc->rejection_reason }}</p>
                @endif
            </div>
        @endif

        @if($currentUser->kyc_status === 'VERIFIED')
            <div class="p-4 rounded-[12px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm">
                Akun Anda sudah terverifikasi <strong>SakuKilat Plus</strong>. Anda menikmati limit saldo <strong>Rp 20.000.000</strong> serta fitur transfer bank <strong>BI-FAST</strong>.
            </div>
        @else
            <div id="kyc-error" class="hidden p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"></div>
            <div id="kyc-success" class="hidden p-3 rounded-[10px] bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)] text-sm"></div>

            <form id="kyc-submit-form" class="space-y-4">
                <div>
                    <label for="kyc-nik" class="block text-xs font-medium text-[var(--muted)] mb-1">Nomor Induk Kependudukan (16 Digit NIK)</label>
                    <input id="kyc-nik" type="text" inputmode="numeric" maxlength="16" placeholder="1771011203980005" required class="sk-input font-mono-id" />
                </div>
                <div>
                    <label for="kyc-name" class="block text-xs font-medium text-[var(--muted)] mb-1">Nama Lengkap Sesuai e-KTP</label>
                    <input id="kyc-name" type="text" value="{{ $currentUser->full_name }}" required class="sk-input" />
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label for="kyc-ktp-url" class="block text-xs font-medium text-[var(--muted)] mb-1">Referensi Foto e-KTP</label>
                        <input id="kyc-ktp-url" type="text" value="sandbox://kyc/ktp-front-demo.jpg" required class="sk-input font-mono-id text-xs" />
                    </div>
                    <div>
                        <label for="kyc-selfie-url" class="block text-xs font-medium text-[var(--muted)] mb-1">Referensi Selfie Liveness</label>
                        <input id="kyc-selfie-url" type="text" value="sandbox://kyc/selfie-liveness-demo.jpg" required class="sk-input font-mono-id text-xs" />
                    </div>
                </div>
                <label class="p-3 rounded-[10px] border border-[var(--border)] bg-[var(--ground)] flex items-center gap-2.5 text-sm cursor-pointer">
                    <input id="kyc-liveness" type="checkbox" checked required class="accent-[var(--accent)]" />
                    <span>Saya menyatakan foto e-KTP asli &amp; pemeriksaan liveness wajah lulus.</span>
                </label>

                <button type="submit" class="w-full sk-btn sk-btn-primary">Ajukan Verifikasi e-KTP</button>
            </form>
        @endif
    </section>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const bioBtn = document.getElementById('bio-toggle-btn');
  if (bioBtn) {
    bioBtn.addEventListener('click', async () => {
      const enabled = bioBtn.getAttribute('data-enabled') === '1';
      await window.SakuKilat.api('/api/v1/auth/biometric', {
        method: 'POST',
        body: JSON.stringify({ action: 'toggle', enabled: !enabled }),
      });
      location.reload();
    });
  }

  const kycForm = document.getElementById('kyc-submit-form');
  if (kycForm) {
    kycForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('kyc-error');
      const okEl = document.getElementById('kyc-success');
      errEl.classList.add('hidden');
      okEl.classList.add('hidden');
      try {
        await window.SakuKilat.api('/api/v1/kyc', {
          method: 'POST',
          body: JSON.stringify({
            nik: document.getElementById('kyc-nik').value.trim(),
            full_name_ktp: document.getElementById('kyc-name').value.trim(),
            ktp_image_url: document.getElementById('kyc-ktp-url').value.trim(),
            selfie_image_url: document.getElementById('kyc-selfie-url').value.trim(),
            liveness_passed: document.getElementById('kyc-liveness').checked,
          }),
        });
        okEl.textContent = 'Pengajuan KYC berhasil dikirim! Menunggu persetujuan Compliance Admin di halaman Admin & Ledger.';
        okEl.classList.remove('hidden');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  }
});
</script>
@endsection

