<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    // Keys whose raw values should be masked in the API response so secrets
    // are never sent to the browser in plain text.
    private const SECRET_KEYS = ['azure_client_secret'];

    // =========================================================================
    // GET /api/settings/login-page  (PUBLIC — no auth required)
    // Returns the login_page group as a flat key → value map so the user-login
    // page can fetch its appearance without a JWT token.
    // =========================================================================
    public function loginPage(): JsonResponse
    {
        $defaults = [
            'login_page_title'       => 'Sign in',
            'login_page_subtitle'    => 'Use your Outlook account to continue',
            'login_page_button_text' => 'Sign in with Microsoft',
            'login_page_footer_text' => 'Your Outlook email and display name will be used as your account details. No separate password required.',
            'login_page_bg_color'    => '#0f0f1a',
            'login_page_card_color'  => '#1a1a2e',
            'login_page_accent_color'=> '#0078d4',
            'login_page_logo_url'    => '',
        ];

        $rows = Setting::where('group', 'login_page')->get()
            ->mapWithKeys(fn ($s) => [$s->key => $s->value ?? ''])
            ->toArray();

        // Merge DB values over defaults so even if the migration hasn't run
        // the endpoint always returns a usable response.
        return response()->json(['settings' => array_merge($defaults, $rows)]);
    }

    // =========================================================================
    // GET /api/admin/settings
    // Returns all settings grouped by their group key.
    // =========================================================================
    public function index(): JsonResponse
    {
        $settings = Setting::orderBy('group')->orderBy('key')->get();

        $grouped = $settings->groupBy('group')->map(fn ($group) =>
            $group->map(fn ($s) => [
                'id'          => $s->id,
                'key'         => $s->key,
                'value'       => $s->typedValue(),
                'raw_value'   => in_array($s->key, self::SECRET_KEYS)
                                    ? ($s->value ? '••••••••' : '')
                                    : $s->value,
                'type'        => $s->type,
                'description' => $s->description,
                'is_secret'   => in_array($s->key, self::SECRET_KEYS),
                'is_set'      => in_array($s->key, self::SECRET_KEYS) ? !empty($s->value) : null,
            ])->values()
        );

        return response()->json(['settings' => $grouped]);
    }

    // =========================================================================
    // PATCH /api/admin/settings
    // Body: { "settings": { "allow_registration": true, "app_name": "..." } }
    // =========================================================================
    public function update(Request $request): JsonResponse
    {
        $input = $request->validate([
            'settings'   => 'required|array',
            'settings.*' => 'present',
        ]);

        $updated = [];
        $errors  = [];

        foreach ($input['settings'] as $key => $value) {
            $setting = Setting::where('key', $key)->first();

            if ($setting === null) {
                $errors[$key] = "Unknown setting key: {$key}";
                continue;
            }

            // Skip masked placeholder values for secret fields — they represent
            // "no change" rather than an actual new value the admin typed.
            if (in_array($key, self::SECRET_KEYS) && $value === '••••••••') {
                continue;
            }

            // Type-safe coercion
            $coerced = match ($setting->type) {
                'boolean' => filter_var($value, FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
                'integer' => (string)(int) $value,
                'json'    => is_array($value) ? json_encode($value) : $value,
                default   => (string) $value,
            };

            $setting->update(['value' => $coerced, 'updated_at' => now()]);
            $updated[$key] = $setting->fresh()->typedValue();
        }

        if (!empty($errors)) {
            return response()->json([
                'error'   => 'partial_update',
                'message' => 'Some settings could not be updated.',
                'errors'  => $errors,
                'updated' => $updated,
            ], 422);
        }

        return response()->json([
            'message' => 'Settings saved successfully.',
            'updated' => $updated,
        ]);
    }

    // =========================================================================
    // POST /api/admin/settings/reset  — restore all defaults
    // =========================================================================
    public function reset(): JsonResponse
    {
        $defaults = [
            'app_name'                   => 'Mail Manager',
            'allow_registration'         => '1',
            'maintenance_mode'           => '0',
            'max_accounts_per_user'      => '10',
            'allowed_email_domains'      => '',
            'emails_per_sync'            => '50',
            'cache_email_bodies'         => '1',
            'jwt_ttl_minutes'            => '1440',
            'require_email_verification' => '0',
            'admin_email'                => '',
            // Login page appearance
            'login_page_title'           => 'Sign in',
            'login_page_subtitle'        => 'Use your Outlook account to continue',
            'login_page_button_text'     => 'Sign in with Microsoft',
            'login_page_footer_text'     => 'Your Outlook email and display name will be used as your account details. No separate password required.',
            'login_page_bg_color'        => '#0f0f1a',
            'login_page_card_color'      => '#1a1a2e',
            'login_page_accent_color'    => '#0078d4',
            'login_page_logo_url'        => '',
            // Azure credentials are intentionally NOT reset — they are
            // environment-specific secrets and resetting them would break OAuth.
        ];

        foreach ($defaults as $key => $value) {
            Setting::where('key', $key)->update(['value' => $value, 'updated_at' => now()]);
        }

        return response()->json(['message' => 'All settings have been reset to defaults.']);
    }
}
