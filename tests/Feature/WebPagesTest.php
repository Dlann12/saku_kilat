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

    public function test_all_12_sakukilat_web_pages_render_without_errors(): void
    {
        $routes = [
            '/',
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
            $res->assertSee('SakuKilat');
        }
    }

    public function test_demo_switch_logout_and_csv_export_work_cleanly(): void
    {
        $budi = User::query()->where('phone_number', '+6281122334455')->firstOrFail();

        $this->from('/merchant')
            ->post('/demo-switch', ['user_id' => $budi->id])
            ->assertRedirect('/merchant');

        $this->get('/merchant')
            ->assertOk()
            ->assertSee('Warung Kopi Pak Budi');

        $csv = $this->get('/riwayat/export.csv');
        $csv->assertOk();
        $csv->assertHeader('Content-Type', 'text/csv; charset=utf-8');
        $this->assertStringContainsString('Referensi,Waktu,Judul', $csv->getContent());

        $this->post('/web-logout')->assertRedirect('/auth');
        // Protected page should redirect back to /auth when explicitly logged out
        $this->get('/')->assertRedirect('/auth');

        // Logging in via API restores web session cleanly
        $this->postJson('/api/v1/auth/login', [
            'phone_number' => '+6285211223344',
            'pin' => '123456',
        ])->assertOk();

        $this->get('/')->assertOk()->assertSee('Dlan');
    }
}
