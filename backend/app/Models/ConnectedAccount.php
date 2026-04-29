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

    /** True when the access token expires within the next 5 minutes. */
    public function tokenNeedsRefresh(): bool
    {
        return $this->token_expires_at->subMinutes(5)->isPast();
    }
}
