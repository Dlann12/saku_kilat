@extends('layouts.app')

@section('content')
@php
    $inv = $overview['ledger_invariant'] ?? ['balanced' => true, 'total_debit' => 0, 'total_credit' => 0, 'discrepancy' => 0, 'total_entries' => 0];
    $adminPersona = $demoPersonas->firstWhere('role', 'ADMIN');
    $isAdmin = $currentUser->role === 'ADMIN';
@endphp

<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Admin Kepatuhan &amp; Audit Buku Besar</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">Verifikasi e-KTP, pembuktian Double-Entry Zero-Discrepancy, Outbox Event &amp; Auto-Reversal</p>
    </div>
    <a href="{{ route('home') }}" class="sk-btn">Beranda</a>
</div>

@if(! $isAdmin && $adminPersona)
    <div class="mb-5 p-4 rounded-[14px] border border-[#f5d08a] bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)] flex flex-wrap items-center justify-between gap-3">
        <div class="text-sm">
            Anda sedang dalam mode baca. Beralihlah ke akun <strong>{{ $adminPersona->full_name }}</strong> untuk menyetujui KYC atau mengeksekusi Auto-Reversal.
        </div>
        <form method="POST" action="{{ route('demo.switch') }}">
            @csrf
            <input type="hidden" name="user_id" value="{{ $adminPersona->id }}" />
            <button type="submit" class="sk-btn min-h-[34px] text-xs">Masuk sebagai {{ $adminPersona->full_name }}</button>
        </form>
    </div>
@endif

{{-- Ledger Invariant & System Liquidity --}}
<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
    <div class="sk-card">
        <div class="flex items-center justify-between gap-2">
            <p class="text-xs text-[var(--muted)]">Status Invariant Double-Entry</p>
            <span class="sk-pill {{ $inv['balanced'] ? 'sk-pill-pos' : 'sk-pill-neg' }}">
                {{ $inv['balanced'] ? 'SEIMBANG (0 SELISIH)' : 'SELISIH TERDETEKSI' }}
            </span>
        </div>
        <p class="mt-2 text-lg font-semibold num">{{ $inv['total_entries'] }} Baris Jurnal</p>
        <p class="text-xs text-[var(--muted)] num mt-0.5">
            Debit = Kredit = {{ \App\Support\Format::rupiah((float) $inv['total_debit']) }}
        </p>
    </div>

    @foreach(($overview['system_wallets'] ?? collect())->take(2) as $sw)
        <div class="sk-card">
            <p class="text-xs text-[var(--muted)]">{{ $sw->name }}</p>
            <p class="mt-2 text-xl font-semibold num">{{ \App\Support\Format::rupiah((float) $sw->balance) }}</p>
            <p class="text-[11px] font-mono-id text-[var(--faint)] mt-0.5">{{ $sw->wallet_type }}</p>
        </div>
    @endforeach
</div>

<div id="admin-error" class="hidden mb-4 p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"></div>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start mb-5">
    {{-- KYC Approval Queue --}}
    <section class="sk-card lg:col-span-6 space-y-3">
        <div>
            <h2 class="text-[16px] font-semibold">Antrean Verifikasi e-KTP (KYC)</h2>
            <p class="text-xs text-[var(--muted)]">Setujui untuk mengaktifkan limit Rp 20 juta dan BI-FAST</p>
        </div>

        <div class="divide-y divide-[var(--rule)]">
            @forelse($overview['kyc_queue'] ?? [] as $doc)
                <div class="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2">
                            <p class="text-sm font-semibold truncate">{{ $doc->full_name_ktp }}</p>
                            <span class="sk-pill {{ $doc->status === 'VERIFIED' ? 'sk-pill-pos' : ($doc->status === 'PENDING' ? 'sk-pill-warn' : 'sk-pill-neg') }}">{{ $doc->status }}</span>
                        </div>
                        <p class="font-mono-id text-xs text-[var(--muted)] mt-0.5">{{ $doc->user?->phone_number ?? '-' }}</p>
                    </div>

                    @if($doc->status === 'PENDING')
                        <div class="flex gap-2">
                            <button
                                type="button"
                                data-kyc-id="{{ $doc->id }}"
                                data-kyc-decision="VERIFIED"
                                @disabled(! $isAdmin)
                                class="sk-btn sk-btn-primary min-h-[32px] px-3 text-xs"
                            >
                                Setujui
                            </button>
                            <button
                                type="button"
                                data-kyc-id="{{ $doc->id }}"
                                data-kyc-decision="REJECTED"
                                @disabled(! $isAdmin)
                                class="sk-btn min-h-[32px] px-3 text-xs text-[var(--negative)]"
                            >
                                Tolak
                            </button>
                        </div>
                    @endif
                </div>
            @empty
                <p class="py-6 text-center text-sm text-[var(--muted)]">Antrean KYC kosong.</p>
            @endforelse
        </div>
    </section>

    {{-- Auto-Reversal Candidates --}}
    <section class="sk-card lg:col-span-6 space-y-3">
        <div>
            <h2 class="text-[16px] font-semibold">Transaksi &amp; Kontrol Auto-Reversal</h2>
            <p class="text-xs text-[var(--muted)]">Jurnal pembalik atomik mengembalikan saldo tanpa mengubah histori asli</p>
        </div>

        <div class="divide-y divide-[var(--rule)] max-h-[340px] overflow-y-auto">
            @forelse($overview['recent_transactions'] ?? [] as $rtx)
                <div class="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div class="min-w-0">
                        <p class="font-medium truncate text-[var(--text)]">{{ $rtx->title }}</p>
                        <p class="font-mono-id text-[11px] text-[var(--faint)]">{{ $rtx->reference_number }} • {{ $rtx->user?->full_name }}</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="num font-semibold">{{ \App\Support\Format::rupiah((float) $rtx->total_amount) }}</span>
                        @if($rtx->status === 'SUCCESS')
                            <button
                                type="button"
                                data-reverse-id="{{ $rtx->id }}"
                                @disabled(! $isAdmin)
                                class="sk-btn min-h-[30px] px-2.5 text-[11px]"
                            >
                                Reverse
                            </button>
                        @else
                            <span class="sk-pill sk-pill-warn">{{ $rtx->status }}</span>
                        @endif
                    </div>
                </div>
            @empty
                <p class="py-6 text-center text-sm text-[var(--muted)]">Belum ada transaksi.</p>
            @endforelse
        </div>
    </section>
</div>

{{-- Ledger Journal Stream --}}
<section class="sk-card space-y-3 mb-5">
    <div>
        <h2 class="text-[16px] font-semibold">Jurnal Buku Besar Terbaru (Append-Only Ledger)</h2>
        <p class="text-xs text-[var(--muted)]">Dilindungi trigger SQL agar entri tidak pernah dapat diubah atau dihapus</p>
    </div>

    <div class="overflow-x-auto">
        <table class="sk-table">
            <thead>
                <tr>
                    <th>Referensi</th>
                    <th>Dompet</th>
                    <th>Tipe</th>
                    <th class="num">Nominal</th>
                    <th class="num">Saldo Akhir</th>
                    <th>Keterangan</th>
                </tr>
            </thead>
            <tbody>
                @foreach($overview['recent_ledger_entries'] ?? [] as $le)
                    <tr>
                        <td class="font-mono-id text-xs">{{ $le->transaction?->reference_number ?? '-' }}</td>
                        <td class="text-xs font-medium">{{ $le->wallet?->name ?? '-' }}</td>
                        <td>
                            <span class="sk-pill {{ $le->entry_type === 'CREDIT' ? 'sk-pill-pos' : 'sk-pill-neutral' }}">{{ $le->entry_type }}</span>
                        </td>
                        <td class="num font-semibold">{{ \App\Support\Format::rupiah((float) $le->amount) }}</td>
                        <td class="num text-xs text-[var(--muted)]">{{ \App\Support\Format::rupiah((float) $le->running_balance) }}</td>
                        <td class="text-xs text-[var(--muted)]">{{ $le->description }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
</section>

{{-- Outbox Event Stream --}}
<section class="sk-card space-y-3">
    <div>
        <h2 class="text-[16px] font-semibold">Aliran Event Outbox (Transactional Outbox Pattern)</h2>
        <p class="text-xs text-[var(--muted)]">Jejak event domain atomik untuk keandalan pengiriman webhook &amp; notifikasi</p>
    </div>

    <div class="overflow-x-auto">
        <table class="sk-table">
            <thead>
                <tr>
                    <th>Topik Event</th>
                    <th>Aggregate ID</th>
                    <th>Status</th>
                    <th>Waktu</th>
                </tr>
            </thead>
            <tbody>
                @forelse($overview['outbox_events'] ?? [] as $ev)
                    <tr>
                        <td class="font-mono-id text-xs font-medium">{{ $ev->topic }}</td>
                        <td class="font-mono-id text-xs text-[var(--muted)]">{{ substr((string) $ev->aggregate_id, 0, 12) }}</td>
                        <td><span class="sk-pill sk-pill-neutral">{{ $ev->status }}</span></td>
                        <td class="text-xs text-[var(--muted)]">{{ \App\Support\Format::dateTimeWib(optional($ev->created_at)->toIso8601String()) }}</td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="4" class="py-6 text-center text-sm text-[var(--muted)]">Belum ada event outbox tercatat.</td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>
</section>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const errEl = document.getElementById('admin-error');

  document.querySelectorAll('[data-kyc-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      errEl.classList.add('hidden');
      try {
        await window.SakuKilat.api(`/api/v1/admin/kyc/${btn.getAttribute('data-kyc-id')}/review`, {
          method: 'POST',
          body: JSON.stringify({
            decision: btn.getAttribute('data-kyc-decision'),
            rejection_reason: btn.getAttribute('data-kyc-decision') === 'REJECTED' ? 'Dokumen tidak terbaca saat audit' : null,
          }),
        });
        location.reload();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  });

  document.querySelectorAll('[data-reverse-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      errEl.classList.add('hidden');
      try {
        await window.SakuKilat.api(`/api/v1/admin/transactions/${btn.getAttribute('data-reverse-id')}/reverse`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'Koreksi / Rekonsiliasi Compliance' }),
        });
        location.reload();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  });
});
</script>
@endsection
