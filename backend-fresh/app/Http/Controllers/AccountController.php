<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Models\Setting;
use App\Services\TokenEncryptionService;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AccountController extends Controller
{
    public function __construct(private TokenEncryptionService $encryption) {}

    // =========================================================================
    // GET /api/accounts
    // Admins receive every connected account; users receive only their own.
    // =========================================================================
    public function index(Request $request): JsonResponse
    {
        $isAdmin = (bool) $request->user()?->is_admin;

        $query = ConnectedAccount::orderByDesc('is_primary')->orderBy('created_at');

        if ($isAdmin) {
            $query->with('user:id,name,email');
        } else {
            $query->where('user_id', $request->input('auth_user_id'));
        }

        // Deduplicate by email — keep the most recently updated row per address.
        // This handles any duplicate records that existed before the upsertAccount
        // fix enforced one-row-per-email at write time.
        $accounts = $query->get()
            ->groupBy('email')
            ->map(fn ($group) => $group->sortByDesc('updated_at')->first())
            ->values()
            ->map(fn ($a) => $this->publicPayload($a, $isAdmin));

        return response()->json(['accounts' => $accounts]);
    }

    // =========================================================================
    // DELETE /api/accounts/{id}
    // =========================================================================
    public function destroy(Request $request, int $id): JsonResponse
    {
        $isAdmin = (bool) $request->user()?->is_admin;

        $query = ConnectedAccount::where('id', $id);
        if (! $isAdmin) {
            $query->where('user_id', $request->input('auth_user_id'));
        }

        $account = $query->first();

        if ($account === null) {
            return response()->json([
                'error'   => 'not_found',
                'message' => 'Account not found or does not belong to you.',
            ], 404);
        }

        $account->delete();

        return response()->json(['message' => 'Account disconnected successfully.']);
    }

    // =========================================================================
    // POST /api/accounts/{id}/refresh
    //
    // Attempts a server-side token refresh using the stored refresh_token.
    // Returns updated expiry + status on success, or an error code on failure.
    // The caller should fall back to OAuth reconnection if 'needs_reconnect' is set.
    // =========================================================================
    public function refresh(Request $request, int $id): JsonResponse
    {
        $isAdmin = (bool) $request->user()?->is_admin;

        $query = ConnectedAccount::where('id', $id);
        if (! $isAdmin) {
            $query->where('user_id', $request->input('auth_user_id'));
        }

        $account = $query->first();

        if ($account === null) {
            return response()->json([
                'error'   => 'not_found',
                'message' => 'Account not found or does not belong to you.',
            ], 404);
        }

        try {
            $this->doRefresh($account);

            $fresh = $account->fresh();
            return response()->json([
                'message'          => 'Token refreshed successfully.',
                'token_expires_at' => $fresh->token_expires_at?->toISOString(),
                'token_status'     => $fresh->tokenStatus(),
            ]);
        } catch (\Throwable $e) {
            Log::warning("Manual token refresh failed for account {$id}: " . $e->getMessage());

            return response()->json([
                'error'           => 'refresh_failed',
                'needs_reconnect' => true,
                'message'         => 'The stored refresh token has expired. Please reconnect the account via Microsoft sign-in.',
            ], 422);
        }
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    private function publicPayload(ConnectedAccount $a, bool $includeOwner = false): array
    {
        $payload = [
            'id'               => $a->id,
            'email'            => $a->email,
            'display_name'     => $a->display_name,
            'avatar_url'       => $a->avatar_url,
            'is_primary'       => $a->is_primary,
            'created_at'       => $a->created_at?->toISOString(),
            // Expiry info included for every user so the sidebar can show
            // the renew button and status dot without a separate admin check.
            'token_expires_at' => $a->token_expires_at?->toISOString(),
            'token_status'     => $a->tokenStatus(),
        ];

        if ($includeOwner) {
            $payload['owner_id']    = $a->user_id;
            $payload['owner_name']  = $a->user?->name;
            $payload['owner_email'] = $a->user?->email;
        }

        return $payload;
    }

    /** Resolve Azure credentials: DB settings take priority over .env values. */
    private function azureConfig(): array
    {
        return [
            'client_id'     => Setting::get('azure_client_id')     ?: config('microsoft.client_id'),
            'client_secret' => Setting::get('azure_client_secret') ?: config('microsoft.client_secret'),
            'tenant_id'     => Setting::get('azure_tenant_id')     ?: config('microsoft.tenant_id', 'common'),
        ];
    }

    private function doRefresh(ConnectedAccount $account): void
    {
        $refreshToken = $this->encryption->decrypt($account->refresh_token);

        if (empty($refreshToken)) {
            throw new \RuntimeException('No refresh token stored for this account.');
        }

        $client = new Client([
            'timeout' => 15,
            'handler' => HandlerStack::create(new StreamHandler()),
        ]);

        $azure = $this->azureConfig();

        $response = $client->post(
            "https://login.microsoftonline.com/{$azure['tenant_id']}/oauth2/v2.0/token",
            [
                'form_params' => [
                    'grant_type'    => 'refresh_token',
                    'client_id'     => $azure['client_id'],
                    'client_secret' => $azure['client_secret'],
                    'refresh_token' => $refreshToken,
                    'scope'         => implode(' ', config('microsoft.scopes')),
                ],
            ]
        );

        $data = json_decode((string) $response->getBody(), true);

        if (empty($data['access_token'])) {
            throw new \RuntimeException('Microsoft did not return an access_token.');
        }

        $account->update([
            'access_token'     => $this->encryption->encrypt($data['access_token']),
            'refresh_token'    => $this->encryption->encrypt($data['refresh_token'] ?? $refreshToken),
            'token_expires_at' => now()->addSeconds((int) ($data['expires_in'] ?? 3600)),
        ]);
    }
}
