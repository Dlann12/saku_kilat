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
            '/admin/login',
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

    public function test_spa_session_bootstrap_demo_switch_logout_and_csv_export(): void
    {
        $stateful = ['Referer' => 'http://localhost/'];

        // Initial session auto-bootstraps Dlan Kusuma demo persona
        $this->withHeaders($stateful)
            ->getJson('/api/v1/auth/session')
            ->assertOk()
            ->assertJsonPath('data.authenticated', true)
            ->assertJsonPath('data.user.phone_number', '+6285211223344');

        // Switch persona via API endpoint
        $budi = User::query()->where('phone_number', '+6281122334455')->firstOrFail();
        $this->withHeaders($stateful)
            ->postJson('/api/v1/auth/demo-switch', ['user_id' => $budi->id])
            ->assertOk()
            ->assertJsonPath('data.user.phone_number', '+6281122334455');

        $this->withHeaders($stateful)
            ->getJson('/api/v1/payments/qris/presets')
            ->assertOk()
            ->assertJsonCount(3, 'data.presets');

        $this->withHeaders($stateful)
            ->getJson('/api/v1/transfers/contacts')
            ->assertOk();

        $csv = $this->withHeaders($stateful)->get('/api/v1/transactions/export.csv');
        $csv->assertOk();
        $csv->assertHeader('Content-Type', 'text/csv; charset=utf-8');
        $this->assertStringContainsString('Referensi,Waktu,Judul', $csv->getContent());

        // Logout clears session and sets sakukilat_logged_out flag
        $this->withHeaders($stateful)
            ->postJson('/api/v1/auth/logout')
            ->assertOk()
            ->assertJsonPath('data.logged_out', true);

        $this->withHeaders($stateful)
            ->getJson('/api/v1/auth/session')
            ->assertOk()
            ->assertJsonPath('data.authenticated', false);

        // API user portal rejects non-user ADMIN login
        $this->withHeaders($stateful)
            ->postJson('/api/v1/auth/login', [
                'phone_number' => '+6281100009999',
                'pin' => '123456',
                'portal' => 'USER',
            ])
            ->assertStatus(403);

        // API admin login rejects normal consumer user
        $this->withHeaders($stateful)
            ->postJson('/api/v1/auth/admin/login', [
                'identifier' => '+6285211223344',
                'pin' => '123456',
            ])
            ->assertStatus(403);

        // API admin login succeeds with Compliance Admin email + PIN
        $this->withHeaders($stateful)
            ->postJson('/api/v1/auth/admin/login', [
                'identifier' => 'compliance@sakukilat.id',
                'pin' => '123456',
                'device_id' => 'AUDIT-STATION-01',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.role', 'ADMIN')
            ->assertJsonPath('data.user.email', 'compliance@sakukilat.id');

        // API user login restores regular user session cleanly
        $this->withHeaders($stateful)
            ->postJson('/api/v1/auth/login', [
                'phone_number' => '+6285211223344',
                'pin' => '123456',
                'portal' => 'USER',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.phone_number', '+6285211223344');
    }
}
