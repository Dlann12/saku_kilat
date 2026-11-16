<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

final class EnsureFrontendOrMobileStateless extends EnsureFrontendRequestsAreStateful
{
    /**
     * Treat Capacitor mobile / Bearer-token requests as stateless so cross-origin
     * HTTP LAN calls from http://localhost inside the APK never hit 419 CSRF checks.
     *
     * @param  Request  $request
     */
    public static function fromFrontend($request): bool
    {
        if ($request->headers->has('X-Saku-Mobile') || $request->bearerToken()) {
            return false;
        }

        return parent::fromFrontend($request);
    }
}
