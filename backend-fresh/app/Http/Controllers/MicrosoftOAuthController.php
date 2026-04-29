<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\Setting;
use App\Models\User;
use App\Services\TokenEncryptionService;
use Firebase\JWT\JWT;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class MicrosoftOAuthController extends Controller
{
    public function __construct(private TokenEncryptionService $encryption) {}

    // -------------------------------------------------------------------------
    // Resolve Azure credentials: DB settings take priority over .env values.
    // This allows the admin panel to configure OAuth without touching the server.
    // -------------------------------------------------------------------------
    private function azureConfig(): array
    {
        return [
            'client_id'     => Setting::get('azure_client_id')     ?: config('microsoft.client_id'),
            'client_secret' => Setting::get('azure_client_secret') ?: config('microsoft.client_secret'),
            'tenant_id'     => Setting::get('azure_tenant_id')     ?: config('microsoft.tenant_id', 'common'),
            'redirect_uri'  => Setting::get('azure_redirect_uri')  ?: config('microsoft.redirect_uri'),
        ];
    }

    // -------------------------------------------------------------------------
    // GET /api/auth/microsoft/redirect
    //
    // Returns the Microsoft authorization URL that the frontend should navigate
    // the user to. Uses a stateless HMAC-signed `state` parameter to carry the
    // user ID across the redirect — no server-side session required, which means
    // this works correctly on API routes where session middleware is not active.
    // -------------------------------------------------------------------------
    public function redirect(Request $request): JsonResponse
    {
        $userId = (int) $request->input('auth_user_id');
        $nonce  = Str::random(32);

        // Optional: caller can pass a return_url so the callback redirects to the
        // right frontend app (user app vs. admin panel). We validate against the
        // FRONTEND_URLS whitelist to prevent open-redirect abuse.
        $returnUrl  = $request->input('return_url', '');
        $returnUrl  = $this->sanitizeReturnUrl($returnUrl);

        // state = base64(userId:nonce:returnUrl) + "." + HMAC(payload, APP_KEY)
        $state = $this->buildState($userId, $nonce, $returnUrl);

        $azure = $this->azureConfig();

        if (empty($azure['client_id']) || empty($azure['client_secret']) || empty($azure['redirect_uri'])) {
            return response()->json([
                'error'   => 'azure_not_configured',
                'message' => 'Azure credentials are not configured. Please fill in the Azure settings in the Admin Panel → Settings → Azure / Microsoft OAuth.',
            ], 503);
        }

        $params = [
            'client_id'     => $azure['client_id'],
            'response_type' => 'code',
            'redirect_uri'  => $azure['redirect_uri'],
            'response_mode' => 'query',
            'scope'         => implode(' ', config('microsoft.scopes')),
            'state'         => $state,
            // prompt=select_account forces the account picker so the user can
            // choose which Microsoft account to add (important for multi-account).
            'prompt'        => 'select_account',
        ];

        $url = "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/authorize?"
            . http_build_query($params);

        return response()->json(['url' => $url]);
    }

    // -------------------------------------------------------------------------
    // GET /api/auth/microsoft/callback
    //
    // Microsoft redirects here with ?code=xxx&state=yyy after the user consents.
    // We exchange the code for tokens, fetch the user's profile from /me,
    // upsert the connected_accounts row, then redirect to the frontend dashboard.
    // -------------------------------------------------------------------------
    public function callback(Request $request): RedirectResponse
    {
        $defaultFrontend = rtrim(env('FRONTEND_URL', 'http://localhost:7100'), '/');

        // ----- CSRF / error guard -----
        if ($request->has('error')) {
            $desc = $request->query('error_description', 'Unknown error');
            return redirect("{$defaultFrontend}/?oauth_error=" . urlencode($desc));
        }

        // Verify the stateless HMAC state.
        // allowAnon=true so userId=0 (user-login flow) passes verification.
        [$userId, $returnUrl] = $this->verifyState($request->query('state', ''), true);
        if ($userId === null) {
            return redirect("{$defaultFrontend}/?oauth_error=" . urlencode('Invalid or tampered state parameter. Please try again.'));
        }

        // Use the return_url embedded in state, or fall back to default frontend.
        $base = rtrim($returnUrl ?: $defaultFrontend, '/');

        // ----- Token exchange (same redirect_uri for both flows) -----
        try {
            $tokens = $this->exchangeCodeForTokens($request->query('code'));
        } catch (\Throwable $e) {
            \Log::error('OAuth token exchange failed', ['error' => $e->getMessage()]);
            return redirect("{$base}/?oauth_error=" . urlencode('Token exchange failed: ' . $e->getMessage()));
        }

        // ----- Fetch Microsoft user profile -----
        try {
            $profile = $this->fetchMicrosoftProfile($tokens['access_token']);
        } catch (\Throwable $e) {
            \Log::error('OAuth profile fetch failed', ['error' => $e->getMessage()]);
            return redirect("{$base}/?oauth_error=" . urlencode('Could not fetch Microsoft profile: ' . $e->getMessage()));
        }

        // ----- Branch: userId=0 → user sign-in/register; userId>0 → account-link -----
        if ($userId === 0) {
            return $this->handleUserLogin($tokens, $profile, $base);
        }

        // ----- Upsert connected account -----
        try {
            $this->upsertAccount((int) $userId, $tokens, $profile);
        } catch (\Throwable $e) {
            \Log::error('OAuth upsert account failed', ['error' => $e->getMessage()]);
            return redirect("{$base}/?oauth_error=" . urlencode('Failed to save account: ' . $e->getMessage()));
        }

        return redirect("{$base}/?account_added=true");
    }

    /**
     * User-login branch of the OAuth callback.
     *
     * 1. Find or create the local User record from the Microsoft profile.
     * 2. Upsert a connected_accounts row so the mailbox is immediately accessible
     *    without the user having to go through a separate "add account" step.
     * 3. Issue a JWT and redirect to the frontend token-landing page.
     */
    private function handleUserLogin(array $tokens, array $profile, string $base): RedirectResponse
    {
        $errorDest = rtrim(env('FRONTEND_URL', 'http://localhost:7100'), '/') . '/user/login';

        $email = strtolower(trim($profile['mail']));

        // ── 1. Find or create the local user ──────────────────────────────────
        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'name'      => $profile['displayName'] ?: explode('@', $email)[0],
                'password'  => Hash::make(Str::random(40)),
                'is_admin'  => false,
                'is_active' => true,
            ]
        );

        if (! $user->is_active) {
            return redirect("{$errorDest}?oauth_error=" . urlencode('Your account has been disabled. Please contact an administrator.'));
        }

        $user->update(['last_login_at' => now()]);

        // ── 2. Upsert the connected account so the mailbox is ready immediately ─
        // This is identical to the account-link flow — tokens, expiry, primary flag.
        // If the user signs in again we simply refresh the stored tokens in place.
        try {
            $this->upsertAccount($user->id, $tokens, $profile);
        } catch (\Throwable $e) {
            // Non-fatal: the user is still authenticated even if the account row
            // fails to save. Log it and continue — the user can retry from Inbox.
            \Log::warning('handleUserLogin: failed to upsert connected account', [
                'user_id' => $user->id,
                'error'   => $e->getMessage(),
            ]);
        }

        // ── 3. Issue JWT and redirect ──────────────────────────────────────────
        $jwt      = $this->generateJwt($user);
        $userJson = base64_encode(json_encode($this->userPayload($user)));

        return redirect("{$base}/user/auth?token=" . urlencode($jwt) . '&user=' . urlencode($userJson));
    }

    // -------------------------------------------------------------------------
    // GET /api/auth/microsoft/user-login  (PUBLIC — no JWT required)
    //
    // Entry-point for regular (non-admin) users who want to sign in with Microsoft.
    // Uses the SAME redirect_uri as the account-link flow (already registered in
    // Azure) — no second redirect URI registration needed.  userId=0 in the HMAC
    // state tells callback() to run the user-login branch instead.
    // -------------------------------------------------------------------------
    public function userLoginRedirect(Request $request): RedirectResponse
    {
        $azure       = $this->azureConfig();
        $frontendUrl = rtrim(env('FRONTEND_URL', 'http://localhost:7100'), '/');

        if (empty($azure['client_id']) || empty($azure['client_secret']) || empty($azure['redirect_uri'])) {
            return redirect("{$frontendUrl}/user/login?oauth_error=" . urlencode('Microsoft sign-in is not configured. Please contact an administrator.'));
        }

        $nonce     = Str::random(32);
        $returnUrl = $this->sanitizeReturnUrl($request->query('return_url', ''));

        // userId=0 in state → callback() routes to the user-login branch.
        $state = $this->buildState(0, $nonce, $returnUrl);

        $params = [
            'client_id'     => $azure['client_id'],
            'response_type' => 'code',
            'redirect_uri'  => $azure['redirect_uri'],   // same URI already in Azure
            'response_mode' => 'query',
            'scope'         => implode(' ', config('microsoft.scopes')),
            'state'         => $state,
            'prompt'        => 'select_account',
        ];

        $url = "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/authorize?"
            . http_build_query($params);

        return redirect($url);
    }

    // -------------------------------------------------------------------------
    // DELETE /api/accounts/{id}  (proxied here for token cleanup)
    // See AccountController — just listed for reference; actual route is there.
    // -------------------------------------------------------------------------

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Exchange the authorization code for access + refresh tokens.
     *
     * @param  string|null  $redirectUri  Override the default redirect URI (e.g. user-login flow).
     * @return array{access_token: string, refresh_token: string, expires_in: int}
     * @throws \RuntimeException
     */
    private function exchangeCodeForTokens(string $code, ?string $redirectUri = null): array
    {
        $client = new Client([
            'timeout' => 15,
            'handler' => HandlerStack::create(new StreamHandler()),
        ]);
        $azure  = $this->azureConfig();

        try {
            $response = $client->post(
                "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/token",
                [
                    'form_params' => [
                        'grant_type'    => 'authorization_code',
                        'client_id'     => $azure['client_id'],
                        'client_secret' => $azure['client_secret'],
                        'code'          => $code,
                        'redirect_uri'  => $redirectUri ?? $azure['redirect_uri'],
                        'scope'         => implode(' ', config('microsoft.scopes')),
                    ],
                ]
            );
        } catch (GuzzleException $e) {
            throw new \RuntimeException('HTTP error during token exchange: ' . $e->getMessage(), 0, $e);
        }

        $data = json_decode((string) $response->getBody(), true);

        if (empty($data['access_token']) || empty($data['refresh_token'])) {
            $errDesc = $data['error_description'] ?? $data['error'] ?? 'Unknown token error';
            throw new \RuntimeException($errDesc);
        }

        return $data;
    }

    /**
     * Call Graph /me to get the signed-in user's email and display name.
     *
     * @return array{mail: string, displayName: string}
     */
    private function fetchMicrosoftProfile(string $accessToken): array
    {
        $client = new Client([
            'timeout' => 10,
            'handler' => HandlerStack::create(new StreamHandler()),
        ]);

        try {
            $response = $client->get('https://graph.microsoft.com/v1.0/me', [
                'headers' => [
                    'Authorization' => "Bearer {$accessToken}",
                    'Accept'        => 'application/json',
                ],
            ]);
        } catch (GuzzleException $e) {
            throw new \RuntimeException('HTTP error fetching profile: ' . $e->getMessage(), 0, $e);
        }

        $profile = json_decode((string) $response->getBody(), true);

        // Graph returns either `mail` or `userPrincipalName`; the latter is always set.
        $email = $profile['mail'] ?? $profile['userPrincipalName'] ?? null;

        if (empty($email)) {
            throw new \RuntimeException('Microsoft profile did not include an email address.');
        }

        return [
            'mail'        => $email,
            'displayName' => $profile['displayName'] ?? '',
        ];
    }

    /**
     * Build a stateless, tamper-proof OAuth state parameter.
     *
     * Format: base64url(userId:nonce:returnUrl) + "." + HMAC-SHA256(payload, APP_KEY)
     *
     * Self-contained — carries the user ID and optional return URL so the callback
     * needs no server session and can redirect to the correct frontend app.
     */
    private function buildState(int $userId, string $nonce, string $returnUrl = ''): string
    {
        $payload = $userId . ':' . $nonce . ':' . $returnUrl;
        $sig     = hash_hmac('sha256', $payload, config('app.key'));

        return rtrim(strtr(base64_encode($payload), '+/', '-_'), '=') . '.' . $sig;
    }

    /**
     * Verify the state and return [userId, returnUrl], or [null, ''] on failure.
     *
     * @param  bool  $allowAnon  When true, userId=0 is considered valid (user-login flow).
     * @return array{int|null, string}
     */
    private function verifyState(string $state, bool $allowAnon = false): array
    {
        $dot = strrpos($state, '.');
        if ($dot === false) {
            return [null, ''];
        }

        $encoded = substr($state, 0, $dot);
        $sig     = substr($state, $dot + 1);

        $payload = base64_decode(strtr($encoded, '-_', '+/') . str_repeat('=', (4 - strlen($encoded) % 4) % 4));

        if ($payload === false || !str_contains($payload, ':')) {
            return [null, ''];
        }

        $expectedSig = hash_hmac('sha256', $payload, config('app.key'));
        if (!hash_equals($expectedSig, $sig)) {
            return [null, ''];
        }

        $parts     = explode(':', $payload, 3);
        $userId    = (int) $parts[0];
        $returnUrl = $parts[2] ?? '';

        if ($userId > 0) return [$userId, $returnUrl];
        if ($allowAnon && $userId === 0) return [0, $returnUrl];

        return [null, ''];
    }

    /**
     * Validate a return_url against the FRONTEND_URLS whitelist to prevent
     * open-redirect attacks. Returns the URL if safe, empty string otherwise.
     */
    private function sanitizeReturnUrl(string $url): string
    {
        if (empty($url)) {
            return '';
        }

        $allowed = array_filter(array_map(
            'trim',
            explode(',', env('FRONTEND_URLS', env('FRONTEND_URL', '')))
        ));

        foreach ($allowed as $allowedOrigin) {
            $allowedOrigin = rtrim($allowedOrigin, '/');
            if (str_starts_with($url, $allowedOrigin)) {
                return $url;
            }
        }

        return '';
    }

    /**
     * Issue a signed JWT for the given user (mirrors AuthController::generateJwt).
     */
    private function generateJwt(User $user): string
    {
        $secret = config('app.jwt_secret') ?? env('JWT_SECRET');
        $ttl    = (int) (config('app.jwt_ttl_minutes') ?? env('JWT_TTL_MINUTES', 1440));
        $now    = time();

        return JWT::encode([
            'iss' => config('app.url'),
            'iat' => $now,
            'exp' => $now + ($ttl * 60),
            'sub' => $user->id,
        ], $secret, 'HS256');
    }

    /**
     * Return the public user payload array (mirrors AuthController::userPayload).
     */
    private function userPayload(User $user): array
    {
        return [
            'id'            => $user->id,
            'name'          => $user->name,
            'email'         => $user->email,
            'is_admin'      => (bool) $user->is_admin,
            'is_active'     => (bool) $user->is_active,
            'last_login_at' => $user->last_login_at?->toISOString(),
            'created_at'    => $user->created_at?->toISOString(),
        ];
    }

    /**
     * Insert or update the connected_accounts row.
     * If the user already has this email linked, we silently update the tokens
     * (e.g. re-consent after token revocation).
     */
    private function upsertAccount(int $userId, array $tokens, array $profile): ConnectedAccount
    {
        $encryptedAccess  = $this->encryption->encrypt($tokens['access_token']);
        $encryptedRefresh = $this->encryption->encrypt($tokens['refresh_token']);
        $expiresAt        = now()->addSeconds((int) ($tokens['expires_in'] ?? 3600));

        // Mark as primary only if this is the user's very first linked account.
        $isPrimary = !ConnectedAccount::where('user_id', $userId)->exists();

        $account = ConnectedAccount::updateOrCreate(
            ['user_id' => $userId, 'email' => $profile['mail']],
            [
                'display_name'     => $profile['displayName'],
                'access_token'     => $encryptedAccess,
                'refresh_token'    => $encryptedRefresh,
                'token_expires_at' => $expiresAt,
                'is_primary'       => $isPrimary,
            ]
        );

        return $account;
    }
}
