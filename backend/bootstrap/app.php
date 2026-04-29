<?php

use App\Http\Middleware\JwtMiddleware;
use App\Http\Middleware\TokenRefreshMiddleware;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__ . '/../routes/api.php',
        apiPrefix: 'api',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Register named aliases so route files can reference them concisely.
        $middleware->alias([
            'jwt'           => JwtMiddleware::class,
            'token.refresh' => TokenRefreshMiddleware::class,
        ]);

        // Allow the frontend origin.  Update for production.
        $middleware->api(prepend: [
            \Illuminate\Http\Middleware\HandleCors::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Return JSON for all API exceptions instead of HTML Blade pages.
        $exceptions->render(function (\Throwable $e, Request $request) {
            if ($request->is('api/*')) {
                $status = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;

                return response()->json([
                    'error'   => 'server_error',
                    'message' => app()->hasDebugModeEnabled()
                        ? $e->getMessage()
                        : 'An unexpected error occurred.',
                ], $status);
            }
        });
    })
    ->create();
