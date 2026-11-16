<?php

namespace App\Providers;

use App\Http\Middleware\EnsureFrontendOrMobileStateless;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(
            EnsureFrontendRequestsAreStateful::class,
            EnsureFrontendOrMobileStateless::class
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
