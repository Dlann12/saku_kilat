<?php

declare(strict_types=1);

use App\Exceptions\DomainException;
use App\Http\Middleware\AutoBootstrapDemoSession;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->redirectGuestsTo('/auth');
        $middleware->prependToPriorityList(
            AuthenticatesRequests::class,
            AutoBootstrapDemoSession::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request): bool => $request->is('api/*') || $request->expectsJson(),
        );

        $exceptions->render(function (DomainException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                $payload = [
                    'error' => [
                        'code' => $e->errorCode,
                        'message' => $e->getMessage(),
                    ],
                ];
                if ($e->details !== null) {
                    $payload['error']['details'] = $e->details;
                }

                return response()->json($payload, $e->statusCode);
            }

            return back()->withErrors(['error' => $e->getMessage()])->withInput();
        });

        $exceptions->render(function (ValidationException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'error' => [
                        'code' => 'VALIDATION_ERROR',
                        'message' => $e->validator->errors()->first() ?: 'Input tidak valid.',
                        'details' => $e->errors(),
                    ],
                ], 422);
            }
        });
    })->create();
