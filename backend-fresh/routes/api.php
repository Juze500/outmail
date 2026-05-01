<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\MailController as AdminMailController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BulkMailController;
use App\Http\Controllers\DraftController;
use App\Http\Controllers\EmailController;
use App\Http\Controllers\FolderController;
use App\Http\Controllers\KeywordController;
use App\Http\Controllers\MicrosoftOAuthController;
use App\Http\Controllers\SearchController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| JwtMiddleware     → validates Bearer token, sets auth_user_id on request
| TokenRefreshMiddleware → proactively refreshes near-expired MS tokens
*/

// ----- Public settings routes (no JWT required) -----
// Exposes only the login_page group so the user login page can fetch its
// appearance without an authenticated session.
Route::get('/settings/login-page', [SettingsController::class, 'loginPage']);

// ----- Public auth routes (no JWT required) -----
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login',    [AuthController::class, 'login']);

    // OAuth callback is called by Microsoft's redirect — must be public.
    Route::get('/microsoft/callback', [MicrosoftOAuthController::class, 'callback']);

    // User sign-in with Microsoft (no existing account required).
    Route::get('/microsoft/user-login', [MicrosoftOAuthController::class, 'userLoginRedirect']);

    // Device code flow — user-login variant (no JWT, creates/finds user, returns JWT).
    // The /start reuses the same method as the admin connect flow.
    Route::post('/microsoft/device-code/user-start', [MicrosoftOAuthController::class, 'deviceCodeStart']);
    Route::post('/microsoft/device-code/user-poll',  [MicrosoftOAuthController::class, 'deviceCodeUserPoll']);
});

// ----- Protected routes — require valid JWT -----
Route::middleware('jwt')->group(function () {

    // Current user info + profile update
    Route::get('/auth/me',        [AuthController::class, 'me']);
    Route::patch('/auth/profile', [AuthController::class, 'updateProfile']);

    // Microsoft OAuth — initiate flow (user must be logged in first)
    Route::get('/auth/microsoft/redirect',           [MicrosoftOAuthController::class, 'redirect']);

    // Device Code flow — works for org accounts that block standard consent
    Route::post('/auth/microsoft/device-code/start', [MicrosoftOAuthController::class, 'deviceCodeStart']);
    Route::post('/auth/microsoft/device-code/poll',  [MicrosoftOAuthController::class, 'deviceCodePoll']);

    // Generate the admin-consent URL so an org admin can pre-approve the app.
    Route::get('/auth/microsoft/admin-consent-url',  [MicrosoftOAuthController::class, 'adminConsentUrl']);

    // ── Drafts (no Graph API — pure DB) ──────────────────────────────────────
    Route::get('/drafts',           [DraftController::class, 'index']);
    Route::post('/drafts',          [DraftController::class, 'store']);
    Route::patch('/drafts/{id}',    [DraftController::class, 'update']);
    Route::delete('/drafts/{id}',   [DraftController::class, 'destroy']);

    // ── Keywords + smart-label matches (queries cached email DB) ─────────────
    // NOTE: /keywords/matches must be registered before /keywords/{id} to
    // prevent Laravel from treating "matches" as an {id} parameter.
    Route::get('/keywords/matches',   [KeywordController::class, 'matches']);
    Route::get('/keywords',           [KeywordController::class, 'index']);
    Route::post('/keywords',          [KeywordController::class, 'store']);
    Route::patch('/keywords/{id}',    [KeywordController::class, 'update']);
    Route::delete('/keywords/{id}',   [KeywordController::class, 'destroy']);

    // ── Bulk mail: parse is stateless ────────────────────────────────────────
    Route::post('/bulk/parse',      [BulkMailController::class, 'parse']);

    // Routes that may call Graph API get automatic token refresh
    Route::middleware('token.refresh')->group(function () {

        // Connected accounts
        Route::get('/accounts',                   [AccountController::class, 'index']);
        Route::delete('/accounts/{id}',           [AccountController::class, 'destroy']);
        Route::post('/accounts/{id}/refresh',     [AccountController::class, 'refresh']);

        // Folders per account
        Route::get('/accounts/{id}/folders', [FolderController::class, 'index']);

        // Email list per account + folder
        Route::get('/accounts/{id}/emails',  [EmailController::class, 'index']);

        // Single email (cache-first)
        Route::get('/emails/{id}',           [EmailController::class, 'show']);

        // Send new email
        Route::post('/emails/send',          [EmailController::class, 'send']);

        // Mutations
        Route::patch('/emails/{id}/read',    [EmailController::class, 'markRead']);
        Route::patch('/emails/{id}/flag',    [EmailController::class, 'flag']);
        Route::post('/emails/{id}/move',     [EmailController::class, 'move']);
        Route::delete('/emails/{id}',        [EmailController::class, 'destroy']);
        Route::post('/emails/{id}/reply',    [EmailController::class, 'reply']);
        Route::post('/emails/{id}/forward',  [EmailController::class, 'forward']);

        // Attachments
        Route::get('/emails/{id}/attachments', [EmailController::class, 'attachments']);

        // Cross-account search
        Route::get('/search', [SearchController::class, 'search']);
    });

    // =========================================================================
    // Admin routes — jwt + admin middleware
    // =========================================================================
    Route::prefix('admin')->middleware('admin')->group(function () {

        // Bulk send — admin only, uses any connected account
        Route::middleware('token.refresh')->group(function () {
            Route::post('/bulk/send', [BulkMailController::class, 'send']);
        });

        // Dashboard stats
        Route::get('/dashboard', [DashboardController::class, 'index']);

        // User management
        Route::get('/users',                               [AdminUserController::class, 'index']);
        Route::post('/users',                              [AdminUserController::class, 'store']);
        Route::get('/users/{id}',                          [AdminUserController::class, 'show']);
        Route::patch('/users/{id}',                        [AdminUserController::class, 'update']);
        Route::delete('/users/{id}',                       [AdminUserController::class, 'destroy']);
        Route::post('/users/{id}/toggle-active',           [AdminUserController::class, 'toggleActive']);
        Route::post('/users/{id}/toggle-admin',            [AdminUserController::class, 'toggleAdmin']);
        Route::delete('/users/{userId}/accounts/{accountId}', [AdminUserController::class, 'destroyAccount']);

        // Mail & account oversight
        Route::get('/mails',                              [AdminMailController::class, 'index']);
        Route::get('/mails/{id}',                         [AdminMailController::class, 'show']);
        Route::delete('/mails/{id}',                      [AdminMailController::class, 'destroy']);
        Route::get('/accounts',                           [AdminMailController::class, 'accounts']);
        Route::delete('/accounts/{id}',                   [AdminMailController::class, 'destroyAccount']);
        Route::get('/accounts/{id}/extract-emails',       [AdminMailController::class, 'extractEmails']);

        // App settings
        Route::get('/settings',        [SettingsController::class, 'index']);
        Route::patch('/settings',      [SettingsController::class, 'update']);
        Route::post('/settings/reset', [SettingsController::class, 'reset']);
    });
});
