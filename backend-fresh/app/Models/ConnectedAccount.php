<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ConnectedAccount extends Model
{
    protected $fillable = [
        'user_id',
        'email',
        'display_name',
        'avatar_url',
        'access_token',
        'refresh_token',
        'token_expires_at',
        'is_primary',
    ];

    protected $hidden = ['access_token', 'refresh_token'];

    protected $casts = [
        'token_expires_at' => 'datetime',
        'is_primary'       => 'boolean',
        'created_at'       => 'datetime',
        'updated_at'       => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function folders(): HasMany
    {
        return $this->hasMany(EmailFolder::class, 'account_id');
    }

    public function emails(): HasMany
    {
        return $this->hasMany(Email::class, 'account_id');
    }

    /**
     * True when the access token expires within the next 10 minutes.
     * Used by TokenRefreshMiddleware as a last-resort per-request refresh.
     * The scheduled `tokens:refresh` command handles the proactive 45-minute window.
     */
    public function tokenNeedsRefresh(): bool
    {
        return $this->token_expires_at?->subMinutes(10)->isPast() ?? false;
    }

    /**
     * Returns a client-friendly status string based on token expiry.
     * - valid    : expires more than 1 hour from now
     * - expiring : expires within the next hour
     * - expired  : already past expiry
     * - unknown  : no expiry date on record
     */
    public function tokenStatus(): string
    {
        $exp = $this->token_expires_at;
        if ($exp === null)                        return 'unknown';
        if ($exp->isPast())                       return 'expired';
        if ($exp->lt(now()->addMinutes(30)))      return 'expiring'; // < 30 min remaining
        return 'valid';
    }
}
