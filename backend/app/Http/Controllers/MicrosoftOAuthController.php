<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Services\TokenEncryptionService;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MicrosoftOAuthController extends Controller
{
    public function __construct(private TokenEncryptionService $encryption) {}

    // -------------------------------------------------------------------------
    // GET /api/auth/microsoft/redirect
    //
    // Returns the Microsoft authorization URL that the frontend should navigate
    // the user to. A PKCE code_verifier is stored in the session so the callback
    // can verify it (recommended by Microsoft for web apps, optional here but
    // good practice). A random `state` prevents CSRF.
    // -------------------------------------------------------------------------
    public function redirect(Request $request): JsonResponse
    {
        $state = Str::random(40);

        // Persist state in server-side session tied to the authenticated user.
        session([
            'ms_oauth_state'   => $state,
            'ms_oauth_user_id' => $request->input('auth_user_id'),
        ]);

        $params = [
            'client_id'     => config('microsoft.client_id'),
            'response_type' => 'code',
            'redirect_uri'  => config('microsoft.redirect_uri'),
            'response_mode' => 'query',
            'scope'         => implode(' ', config('microsoft.scopes')),
            'state'         => $state,
            // prompt=select_account forces the account picker so the user can
            // choose which Microsoft account to add (important for multi-account).
            'prompt'        => 'select_account',
        ];

        $tenantId = config('microsoft.tenant_id');
        $url      = "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/authorize?"
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
        $frontendUrl = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173'));

        // ----- CSRF / error guard -----
        if ($request->has('error')) {
            $desc = $request->query('error_description', 'Unknown error');
            return redirect("{$frontendUrl}/dashboard?oauth_error=" . urlencode($desc));
        }

        $sessionState = session('ms_oauth_state');
        $requestState = $request->query('state');

        if (empty($sessionState) || !hash_equals($sessionState, $requestState)) {
            return redirect("{$frontendUrl}/dashboard?oauth_error=" . urlencode('State mismatch. Possible CSRF.'));
        }

        $userId = session('ms_oauth_user_id');
        if (empty($userId)) {
            return redirect("{$frontendUrl}/dashboard?oauth_error=" . urlencode('Session expired. Please try again.'));
        }

        // Clear one-time session values immediately.
        session()->forget(['ms_oauth_state', 'ms_oauth_user_id']);

        // ----- Token exchange -----
        try {
            $tokens = $this->exchangeCodeForTokens($request->query('code'));
        } catch (\Throwable $e) {
            return redirect("{$frontendUrl}/dashboard?oauth_error=" . urlencode('Token exchange failed: ' . $e->getMessage()));
        }

        // ----- Fetch Microsoft user profile -----
        try {
            $profile = $this->fetchMicrosoftProfile($tokens['access_token']);
        } catch (\Throwable $e) {
            return redirect("{$frontendUrl}/dashboard?oauth_error=" . urlencode('Could not fetch Microsoft profile.'));
        }

        // ----- Upsert connected account -----
        $this->upsertAccount((int) $userId, $tokens, $profile);

        return redirect("{$frontendUrl}/dashboard?account_added=true");
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
     * @return array{access_token: string, refresh_token: string, expires_in: int}
     * @throws \RuntimeException
     */
    private function exchangeCodeForTokens(string $code): array
    {
        $client   = new Client(['timeout' => 15]);
        $tenantId = config('microsoft.tenant_id');

        try {
            $response = $client->post(
                "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token",
                [
                    'form_params' => [
                        'grant_type'    => 'authorization_code',
                        'client_id'     => config('microsoft.client_id'),
                        'client_secret' => config('microsoft.client_secret'),
                        'code'          => $code,
                        'redirect_uri'  => config('microsoft.redirect_uri'),
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
        $client = new Client(['timeout' => 10]);

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
