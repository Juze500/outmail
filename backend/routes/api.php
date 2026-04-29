<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\MicrosoftOAuthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| JwtMiddleware     → validates Bearer token, sets auth_user_id on request
| TokenRefreshMiddleware → proactively refreshes near-expired MS tokens
*/

// ----- Public auth routes (no JWT required) -----
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login',    [AuthController::class, 'login']);

    // OAuth callback is called by Microsoft's redirect — must be public.
    // The user_id comes from the server-side session set during /redirect.
    Route::get('/microsoft/callback', [MicrosoftOAuthController::class, 'callback']);
});

// ----- Protected routes — require valid JWT -----
Route::middleware('jwt')->group(function () {

    // Current user info
    Route::get('/auth/me', [AuthController::class, 'me']);

    // Microsoft OAuth — initiate flow (user must be logged in first)
    Route::get('/auth/microsoft/redirect', [MicrosoftOAuthController::class, 'redirect']);

    // Connected accounts
    Route::middleware('token.refresh')->group(function () {
        Route::get('/accounts',       [AccountController::class, 'index']);
        Route::delete('/accounts/{id}', [AccountController::class, 'destroy']);

        // Phases 2-6 routes live here (folders, emails, search, send)
        // Add them as you build each phase.
    });
});
