<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    public $timestamps = false;

    const UPDATED_AT = 'updated_at';

    protected $fillable = ['key', 'value', 'type', 'description', 'group'];

    protected $primaryKey = 'id';

    // -------------------------------------------------------------------------
    // Typed value accessor
    // -------------------------------------------------------------------------

    /** Return the value cast to its declared type. */
    public function typedValue(): mixed
    {
        return match ($this->type) {
            'boolean' => (bool)(int) $this->value,
            'integer' => (int) $this->value,
            'json'    => json_decode($this->value, true),
            default   => $this->value,
        };
    }

    // -------------------------------------------------------------------------
    // Static helpers
    // -------------------------------------------------------------------------

    public static function get(string $key, mixed $default = null): mixed
    {
        $setting = static::where('key', $key)->first();
        return $setting ? $setting->typedValue() : $default;
    }

    public static function set(string $key, mixed $value): void
    {
        static::where('key', $key)->update([
            'value'      => is_array($value) ? json_encode($value) : (string) $value,
            'updated_at' => now(),
        ]);
    }
}
