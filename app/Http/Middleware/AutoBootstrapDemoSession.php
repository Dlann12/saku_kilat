<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

final class AutoBootstrapDemoSession
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! Auth::check() && ! $request->session()->get('sakukilat_logged_out', false)) {
            $demoUser = User::query()->find(DatabaseSeeder::IDS['dlan'])
                ?? User::query()->where('role', '!=', 'SYSTEM')->first();

            if ($demoUser) {
                Auth::login($demoUser);
            }
        }

        return $next($request);
    }
}
