<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class WebPagesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_all_spa_history_routes_render_vue_mount_shell(): void
    {
        $routes = [
            '/',
            '/login',
            '/auth',
            '/topup',
            '/pockets',
            '/qris',
            '/transfer',
            '/ppob',
            '/split-bill',
            '/riwayat',
            '/profil',
            '/merchant',
            '/admin',
        ];

        foreach ($routes as $path) {
            $res = $this->get($path);
            $res->assertOk();
            $res->assertSee('<div id="app"></div>', false);
        }
    }

    public function test_unified_login_and_admin_app_config_enforcement(): void
    {
        $stateful = ['Referer' => 'http://localhost/'];

        // Initial session auto-bootstraps Dlan Kusuma demo persona + default app_config
        $this->withHeaders($stateful)
            ->getJson('/api/v1/auth/session')
            ->assertOk()
            ->assertJsonPath('data.authenticated', true)
            ->assertJsonPath('data.user.phone_number', '+6285211223344')
            ->assertJsonPath('data.app_config.permissions.allow_ppob', true);

        // Regular user cannot update admin app config
        $this->withHeaders($stateful)
            ->putJson('/api/v1/admin/config', [
                'permissions' => ['allow_ppob' => false],
            ])
            ->assertStatus(403);

        // Unified login accepts Compliance Admin email + PIN
        $this->withHeaders($stateful)
            ->postJson('/api/v1/auth/login', [
                'identifier' => 'compliance@sakukilat.id',
                'pin' => '123456',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.role', 'ADMIN');

        // Admin disables PPOB and raises SakuKilat Plus balance limit to Rp 25M
        $this->withHeaders($stateful)
            ->putJson('/api/v1/admin/config', [
                'permissions' => ['allow_ppob' => false],
                'limits' => ['verified_balance_limit' => 25_000_000],
            ])
            ->assertOk()
            ->assertJsonPath('data.permissions.allow_ppob', false)
            ->assertJsonPath('data.limits.verified_balance_limit', 25_000_000);

        // Switch back to regular verified user Dlan via unified login
        $this->withHeaders($stateful)
            ->postJson('/api/v1/auth/login', [
                'identifier' => '+6285211223344',
                'pin' => '123456',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.role', 'USER');

        // Session now reports updated app_config & balance limit
        $this->withHeaders($stateful)
            ->getJson('/api/v1/auth/session')
            ->assertOk()
            ->assertJsonPath('data.balance_limit', 25_000_000)
            ->assertJsonPath('data.app_config.permissions.allow_ppob', false);

        // Executing PPOB while disabled fails with 403 FEATURE_DISABLED_BY_ADMIN
        $pinRes = $this->withHeaders($stateful)
            ->postJson('/api/v1/auth/pin/verify', ['pin' => '123456'])
            ->assertOk();
        $txToken = $pinRes->json('data.tx_auth_token');

        $this->withHeaders([
            ...$stateful,
            'X-Idempotency-Key' => 'ppob-disabled-test-01',
        ])->postJson('/api/v1/ppob/execute', [
            'product_code' => 'PULSA_TSEL_25',
            'customer_number' => '085211223344',
            'source_wallet_id' => DatabaseSeeder::WALLETS['dlan_main'],
            'tx_auth_token' => $txToken,
        ])->assertStatus(403)
            ->assertJsonPath('error.code', 'FEATURE_DISABLED_BY_ADMIN');

        // Verify CSV & logout
        $csv = $this->withHeaders($stateful)->get('/api/v1/transactions/export.csv');
        $csv->assertOk();
        $this->withHeaders($stateful)
            ->postJson('/api/v1/auth/logout')
            ->assertOk();
        $this->withHeaders($stateful)
            ->getJson('/api/v1/auth/session')
            ->assertOk()
            ->assertJsonPath('data.authenticated', false);

        // Re-seed sanity check using model helper
        $this->assertTrue(User::query()->where('role', 'ADMIN')->exists());
    }
}
