@extends('layouts.app')

@section('content')
<div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
        <h1 class="text-[22px] sm:text-[26px] font-semibold tracking-tight">Patungan (Split Bill)</h1>
        <p class="text-sm text-[var(--muted)] mt-0.5">Bagi tagihan merata atau per item pesanan bersama teman SakuKilat</p>
    </div>
    <a href="{{ route('home') }}" class="sk-btn">Kembali</a>
</div>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
    <section class="sk-card lg:col-span-5 space-y-4">
        <div>
            <h2 class="text-[16px] font-semibold">Buat Tagihan Patungan</h2>
            <p class="text-xs text-[var(--muted)]">Peserta otomatis menerima notifikasi dan bisa langsung bayar via PIN</p>
        </div>

        <div id="sb-error" class="hidden p-3 rounded-[10px] bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)] text-sm"></div>

        <form id="sb-create-form" class="space-y-4">
            <div>
                <label for="sb-title" class="block text-xs font-medium text-[var(--muted)] mb-1">Judul Tagihan</label>
                <input id="sb-title" type="text" placeholder="Contoh: Makan Siang Tim" required class="sk-input text-sm" />
            </div>

            <div>
                <label class="block text-xs font-medium text-[var(--muted)] mb-1.5">Metode Pembagian</label>
                <div class="grid grid-cols-2 gap-2">
                    <label class="p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] cursor-pointer flex items-center gap-2 text-sm">
                        <input type="radio" name="split_mode" value="EQUAL" checked class="accent-[var(--accent)]" />
                        <span>Bagi Rata</span>
                    </label>
                    <label class="p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] cursor-pointer flex items-center gap-2 text-sm">
                        <input type="radio" name="split_mode" value="ITEMIZED" class="accent-[var(--accent)]" />
                        <span>Per Item</span>
                    </label>
                </div>
            </div>

            <div id="sb-equal-box">
                <label for="sb-total" class="block text-xs font-medium text-[var(--muted)] mb-1">Total Tagihan Keseluruhan</label>
                <div class="flex items-center h-10 rounded-[10px] border border-[var(--control)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
                    <span class="text-sm font-semibold text-[var(--muted)] mr-2 shrink-0">Rp</span>
                    <input id="sb-total" type="number" min="1000" step="1000" value="150000" class="w-full bg-transparent border-0 outline-none text-sm font-semibold num" />
                </div>
            </div>

            <div>
                <p class="text-xs font-medium text-[var(--muted)] mb-1.5">Pilih Peserta Patungan (selain Anda)</p>
                <div class="space-y-1.5 max-h-[170px] overflow-y-auto pr-1">
                    @foreach($peers as $peer)
                        <label class="p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--ground)] flex items-center justify-between gap-2 text-sm cursor-pointer">
                            <span class="flex items-center gap-2 min-w-0">
                                <input type="checkbox" name="sb_peers" value="{{ $peer->phone_number }}" data-name="{{ $peer->full_name }}" @checked($loop->index < 2) class="accent-[var(--accent)]" />
                                <span class="truncate font-medium">{{ $peer->full_name }}</span>
                            </span>
                            <span class="font-mono-id text-xs text-[var(--muted)] shrink-0">{{ $peer->phone_number }}</span>
                        </label>
                    @endforeach
                </div>
            </div>

            <div id="sb-items-box" class="hidden space-y-2.5 pt-2 border-t border-[var(--rule)]">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-medium text-[var(--muted)]">Daftar Item Pesanan</span>
                    <button type="button" id="sb-add-item" class="text-xs font-medium text-[var(--accent)]">+ Tambah Item</button>
                </div>
                <div id="sb-items-list" class="space-y-2"></div>
            </div>

            <button type="submit" class="w-full sk-btn sk-btn-primary">Kirim Tagihan Patungan</button>
        </form>
    </section>

    <section class="lg:col-span-7 space-y-4">
        @if($usableWallets->isNotEmpty())
            <div class="sk-card flex flex-wrap items-center justify-between gap-3">
                <label for="sb-pay-wallet" class="text-sm font-medium">Dompet untuk Bayar Tagihan Saya</label>
                <select id="sb-pay-wallet" class="sk-input sm:w-[290px] text-sm">
                    @foreach($usableWallets as $w)
                        <option value="{{ $w->id }}">{{ $w->name }} — {{ \App\Support\Format::rupiah((float) $w->balance) }}</option>
                    @endforeach
                </select>
            </div>
        @endif

        @forelse($bills as $bill)
            @php
                $totalB = (float) $bill['total_amount'];
                $colB = (float) $bill['collected_amount'];
                $pctB = $totalB > 0 ? min(100, (int) round(($colB / $totalB) * 100)) : 0;
                $myPending = collect($bill['participants'])->first(fn ($pt) => $pt['user_id'] === $currentUser->id && $pt['status'] === 'PENDING');
            @endphp
            <div class="sk-card space-y-3.5">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="text-base font-semibold">{{ $bill['title'] }}</h3>
                            <span class="sk-pill sk-pill-neutral">{{ $bill['split_mode'] === 'EQUAL' ? 'Bagi Rata' : 'Per Item' }}</span>
                            <span class="sk-pill {{ $bill['status'] === 'SETTLED' ? 'sk-pill-pos' : 'sk-pill-warn' }}">{{ $bill['status'] }}</span>
                        </div>
                        <p class="text-xs text-[var(--muted)] mt-0.5">Dibuat oleh {{ $bill['creator_name'] }}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-base font-semibold num">{{ \App\Support\Format::rupiah($totalB) }}</p>
                        <p class="text-xs text-[var(--muted)] num">Terkumpul {{ \App\Support\Format::rupiah($colB) }}</p>
                    </div>
                </div>

                <div class="h-1.5 rounded-full bg-[var(--ground)] overflow-hidden">
                    <div class="h-full rounded-full bg-[var(--accent)]" style="width: {{ $pctB }}%"></div>
                </div>

                <div class="divide-y divide-[var(--rule)]">
                    @foreach($bill['participants'] as $pt)
                        <div class="py-2 flex items-center justify-between gap-2 text-sm">
                            <span class="font-medium">{{ $pt['display_name'] }}</span>
                            <div class="flex items-center gap-2.5">
                                <span class="num font-semibold">{{ \App\Support\Format::rupiah((float) $pt['share_amount']) }}</span>
                                <span class="sk-pill {{ $pt['status'] === 'PAID' ? 'sk-pill-pos' : 'sk-pill-warn' }}">{{ $pt['status'] }}</span>
                            </div>
                        </div>
                    @endforeach
                </div>

                @if($myPending)
                    <div class="pt-2 border-t border-[var(--rule)] flex items-center justify-between gap-3">
                        <span class="text-xs text-[var(--muted)]">Bagian Anda belum dibayar</span>
                        <button
                            type="button"
                            data-pay-bill="{{ $bill['id'] }}"
                            data-bill-title="{{ $bill['title'] }}"
                            data-bill-amount="{{ (float) $myPending['share_amount'] }}"
                            class="sk-btn sk-btn-primary min-h-[36px] text-xs"
                        >
                            Bayar Bagian Saya ({{ \App\Support\Format::rupiah((float) $myPending['share_amount']) }})
                        </button>
                    </div>
                @endif
            </div>
        @empty
            <div class="sk-card py-10 text-center text-sm text-[var(--muted)]">
                Belum ada tagihan patungan.
            </div>
        @endforelse
    </section>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  const errEl = document.getElementById('sb-error');
  const equalBox = document.getElementById('sb-equal-box');
  const itemsBox = document.getElementById('sb-items-box');
  const itemsList = document.getElementById('sb-items-list');
  const selfPhone = @json($currentUser->phone_number);

  function selectedPhones() {
    return Array.from(document.querySelectorAll('input[name="sb_peers"]:checked')).map((i) => i.value);
  }

  function addItemRow(name = '', price = 35000) {
    const row = document.createElement('div');
    row.className = 'p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--ground)] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center';
    row.innerHTML = `
      <input type="text" data-item-name value="${name}" placeholder="Nama item" class="sk-input sm:col-span-6 text-xs h-9" />
      <input type="number" data-item-price value="${price}" min="100" step="500" class="sk-input sm:col-span-4 text-xs h-9 num" />
      <button type="button" data-item-remove class="sm:col-span-2 text-xs text-[var(--negative)] font-medium">Hapus</button>
    `;
    row.querySelector('[data-item-remove]').addEventListener('click', () => row.remove());
    itemsList.appendChild(row);
  }

  addItemRow('Nasi Goreng Spesial', 42000);
  addItemRow('Kopi Susu Gula Aren', 28000);

  document.getElementById('sb-add-item').addEventListener('click', () => addItemRow('', 25000));

  document.querySelectorAll('input[name="split_mode"]').forEach((r) => {
    r.addEventListener('change', () => {
      const itemized = r.value === 'ITEMIZED' && r.checked;
      equalBox.classList.toggle('hidden', itemized);
      itemsBox.classList.toggle('hidden', !itemized);
    });
  });

  document.getElementById('sb-create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const mode = document.querySelector('input[name="split_mode"]:checked').value;
    const peers = selectedPhones();
    if (peers.length === 0) {
      errEl.textContent = 'Pilih minimal 1 teman untuk patungan.';
      errEl.classList.remove('hidden');
      return;
    }

    const payload = {
      title: document.getElementById('sb-title').value.trim(),
      split_mode: mode,
      participant_phones: peers,
    };

    if (mode === 'EQUAL') {
      payload.total_amount = Number(document.getElementById('sb-total').value);
    } else {
      const assignedAll = [selfPhone, ...peers];
      payload.items = Array.from(itemsList.children).map((row) => ({
        name: row.querySelector('[data-item-name]').value.trim() || 'Item',
        price: Number(row.querySelector('[data-item-price]').value || 1000),
        assigned_phones: assignedAll,
      }));
    }

    try {
      await window.SakuKilat.api('/api/v1/split-bills', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      location.reload();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  document.querySelectorAll('[data-pay-bill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-pay-bill');
      const title = btn.getAttribute('data-bill-title');
      const amt = Number(btn.getAttribute('data-bill-amount'));
      const walletId = document.getElementById('sb-pay-wallet')?.value;
      if (!walletId) return;
      const idempotencyKey = window.SakuKilat.makeIdempotencyKey('split');

      window.SakuKilat.openPinModal({
        title: `Bayar Patungan: ${title}`,
        amount: amt,
        onAuthorized: async (txAuthToken) => {
          try {
            const tx = await window.SakuKilat.api(`/api/v1/split-bills/${id}/pay`, {
              method: 'POST',
              idempotencyKey,
              body: JSON.stringify({
                source_wallet_id: walletId,
                tx_auth_token: txAuthToken,
              }),
            });
            window.SakuKilat.openReceiptModal(tx);
            document.getElementById('sk-rcpt-close')?.addEventListener('click', () => location.reload(), { once: true });
          } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        },
      });
    });
  });
});
</script>
@endsection
