<?php

namespace App\Console\Commands;

use App\Models\ConnectedAccount;
use App\Models\Setting;
use App\Services\TokenEncryptionService;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Handler\StreamHandler;
use GuzzleHttp\HandlerStack;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Proactively refreshes Microsoft OAuth tokens before they expire.
 *
 * Designed to run on a schedule (every 15 minutes via the Laravel scheduler).
 * The --window option (default 45 minutes) controls how far ahead to look —
 * any token expiring within that window is refreshed immediately.
 *
 * This complements TokenRefreshMiddleware (which only fires on incoming
 * requests) by ensuring tokens stay alive for users who are not actively
 * using the app right now.
 *
 * Usage:
 *   php artisan tokens:refresh              # refresh all expiring within 45 min
 *   php artisan tokens:refresh --window=60  # extend the lookahead window
 *   php artisan tokens:refresh --dry-run    # list candidates without refreshing
 */
class RefreshTokens extends Command
{
    protected $signature = 'tokens:refresh
                            {--window=45 : Minutes ahead to consider for refresh}
                            {--dry-run   : List accounts that need refresh without actually refreshing}';

    protected $description = 'Proactively refresh Microsoft OAuth tokens expiring soon';

    public function __construct(private TokenEncryptionService $encryption)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $window = max(1, (int) $this->option('window'));
        $dryRun = (bool) $this->option('dry-run');

        $accounts = ConnectedAccount::where('token_expires_at', '<', now()->addMinutes($window))
            ->whereNotNull('refresh_token')
            ->orderBy('token_expires_at')
            ->get();

        if ($accounts->isEmpty()) {
            $this->info("✓ All tokens are valid (none expire within {$window} minutes).");
            return self::SUCCESS;
        }

        $this->line(sprintf(
            '<comment>Found %d account(s) whose token expires within %d minutes%s</comment>',
            $accounts->count(),
            $window,
            $dryRun ? ' — dry run, not refreshing' : ''
        ));

        if ($dryRun) {
            $this->table(
                ['Account', 'Email', 'Expires At'],
                $accounts->map(fn ($a) => [
                    $a->id,
                    $a->email,
                    $a->token_expires_at?->toDateTimeString() ?? 'null',
                ])->toArray()
            );
            return self::SUCCESS;
        }

        $success = 0;
        $failed  = 0;

        foreach ($accounts as $account) {
            try {
                $this->refreshAccount($account);
                $success++;
                $this->line("  <info>✓</info> [{$account->id}] {$account->email}");
            } catch (\Throwable $e) {
                $failed++;
                $this->line("  <error>✗</error> [{$account->id}] {$account->email}: {$e->getMessage()}");
                Log::warning("Scheduled token refresh failed for account {$account->id}: " . $e->getMessage());
            }
        }

        $this->newLine();
        $this->info("Done — {$success} refreshed, {$failed} failed.");

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }

    // -------------------------------------------------------------------------

    /**
     * Resolve Azure credentials the same way the middleware and OAuth controller do:
     * DB settings take priority over .env values.
     */
    private function azureConfig(): array
    {
        return [
            'client_id'     => Setting::get('azure_client_id')     ?: config('microsoft.client_id'),
            'client_secret' => Setting::get('azure_client_secret') ?: config('microsoft.client_secret'),
            'tenant_id'     => Setting::get('azure_tenant_id')     ?: config('microsoft.tenant_id', 'common'),
        ];
    }

    private function refreshAccount(ConnectedAccount $account): void
    {
        $refreshToken = $this->encryption->decrypt($account->refresh_token);

        if (empty($refreshToken)) {
            throw new \RuntimeException('Refresh token is empty — account may need to be reconnected.');
        }

        // StreamHandler bypasses c-ares DNS issues on this build.
        $client = new Client([
            'timeout' => 15,
            'handler' => HandlerStack::create(new StreamHandler()),
        ]);

        $azure    = $this->azureConfig();
        $tenantId = $azure['tenant_id'];

        $response = $client->post(
            "https://login.microsoftonline.com/{$tenantId}/oauth2/v2.0/token",
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
            throw new \RuntimeException('Microsoft returned no access_token in the refresh response.');
        }

        $account->update([
            'access_token'     => $this->encryption->encrypt($data['access_token']),
            'refresh_token'    => $this->encryption->encrypt($data['refresh_token'] ?? $refreshToken),
            'token_expires_at' => now()->addSeconds((int) ($data['expires_in'] ?? 3600)),
        ]);
    }
}
