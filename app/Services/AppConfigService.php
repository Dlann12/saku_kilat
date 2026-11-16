<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\DomainException;
use App\Models\AppSetting;
use App\Models\OutboxEvent;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

final class AppConfigService
{
    private const CONFIG_KEY = 'sakukilat.app_config';

    private const CACHE_KEY = 'sakukilat:app_config:v1';

    public const DEFAULT_PERMISSIONS = [
        'allow_topup' => true,
        'allow_qris' => true,
        'allow_p2p_transfer' => true,
        'allow_bank_transfer' => true,
        'allow_ppob' => true,
        'allow_split_bill' => true,
        'allow_pockets' => true,
        'allow_kyc_submission' => true,
    ];

    public static function defaults(): array
    {
        return [
            'permissions' => self::DEFAULT_PERMISSIONS,
            'limits' => [
                'unverified_balance_limit' => (int) config('sakukilat.unverified_balance_limit', 2_000_000),
                'verified_balance_limit' => (int) config('sakukilat.verified_balance_limit', 20_000_000),
                'bifast_monthly_free_quota' => (int) config('sakukilat.bifast_monthly_free_quota', 10),
                'bifast_fee_after_quota' => (int) config('sakukilat.bifast_fee_after_quota', 2_500),
            ],
        ];
    }

    public function get(): array
    {
        return Cache::remember(self::CACHE_KEY, 300, function (): array {
            $defaults = self::defaults();
            if (! Schema::hasTable('app_settings')) {
                return $defaults;
            }

            $row = AppSetting::query()->find(self::CONFIG_KEY);
            $stored = is_array($row?->value) ? $row->value : [];

            return [
                'permissions' => array_merge($defaults['permissions'], $stored['permissions'] ?? []),
                'limits' => array_merge($defaults['limits'], $stored['limits'] ?? []),
                'updated_at' => $row?->updated_at?->toIso8601String(),
            ];
        });
    }

    public function isEnabled(string $permissionKey): bool
    {
        $cfg = $this->get();

        return (bool) ($cfg['permissions'][$permissionKey] ?? true);
    }

    public function ensureEnabled(string $permissionKey, string $label): void
    {
        if (! $this->isEnabled($permissionKey)) {
            throw new DomainException(
                'FEATURE_DISABLED_BY_ADMIN',
                "Fitur {$label} saat ini sedang dinonaktifkan oleh Administrator.",
                403
            );
        }
    }

    public function update(User $admin, array $data): array
    {
        if ($admin->role !== 'ADMIN') {
            throw new DomainException('FORBIDDEN', 'Hanya Administrator yang dapat mengubah konfigurasi aplikasi.', 403);
        }

        $current = $this->get();
        $next = [
            'permissions' => array_merge(
                $current['permissions'],
                array_map(static fn ($v): bool => (bool) $v, $data['permissions'] ?? [])
            ),
            'limits' => array_merge(
                $current['limits'],
                array_map(static fn ($v): int => (int) $v, $data['limits'] ?? [])
            ),
        ];

        DB::transaction(function () use ($admin, $next): void {
            AppSetting::query()->updateOrCreate(
                ['key' => self::CONFIG_KEY],
                [
                    'value' => $next,
                    'updated_by' => $admin->id,
                ]
            );

            OutboxEvent::create([
                'event_id' => (string) Str::uuid(),
                'topic' => 'admin.app_config.updated',
                'aggregate_type' => 'AppSetting',
                'aggregate_id' => $admin->id,
                'payload' => $next,
                'status' => 'PUBLISHED',
            ]);
        });

        Cache::forget(self::CACHE_KEY);

        return $this->get();
    }
}
