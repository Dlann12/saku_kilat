<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Carbon;

final class Format
{
    public static function rupiah(float|int $amount): string
    {
        $abs = number_format(abs($amount), 0, ',', '.');

        return ($amount < 0 ? '-' : '')."Rp\u{00A0}{$abs}";
    }

    public static function signedRupiah(float|int $amount, string $direction): string
    {
        $formatted = self::rupiah(abs($amount));
        if ($direction === 'IN') {
            return '+'.$formatted;
        }
        if ($direction === 'OUT') {
            return '-'.$formatted;
        }

        return $formatted;
    }

    public static function dateTimeWib(?string $iso): string
    {
        if (! $iso) {
            return '-';
        }

        return Carbon::parse($iso)
            ->timezone('Asia/Jakarta')
            ->translatedFormat('d M Y, H.i');
    }

    /**
     * @return array{bg: string, ink: string, label: string}
     */
    public static function pocketColors(?string $categoryKey): array
    {
        return match (strtolower((string) $categoryKey)) {
            'food' => ['bg' => 'var(--pocket-food-bg)', 'ink' => 'var(--pocket-food-ink)', 'label' => 'Konsumsi'],
            'transport' => ['bg' => 'var(--pocket-transport-bg)', 'ink' => 'var(--pocket-transport-ink)', 'label' => 'Transportasi'],
            'savings' => ['bg' => 'var(--pocket-savings-bg)', 'ink' => 'var(--pocket-savings-ink)', 'label' => 'Tabungan'],
            'bills' => ['bg' => 'var(--pocket-bills-bg)', 'ink' => 'var(--pocket-bills-ink)', 'label' => 'Tagihan'],
            default => ['bg' => 'var(--accent-soft)', 'ink' => 'var(--accent-ink)', 'label' => 'Utama'],
        };
    }
}
