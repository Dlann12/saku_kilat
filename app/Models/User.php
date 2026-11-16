<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

final class User extends Authenticatable
{
    use HasApiTokens, HasUuids, Notifiable;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'phone_number',
        'full_name',
        'email',
        'pin_hash',
        'pin_attempts',
        'pin_locked_until',
        'biometric_enabled',
        'active_device_id',
        'kyc_status',
        'account_status',
        'role',
    ];

    protected $hidden = [
        'pin_hash',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'pin_attempts' => 'integer',
            'pin_locked_until' => 'datetime',
            'biometric_enabled' => 'boolean',
        ];
    }

    public function wallets(): HasMany
    {
        return $this->hasMany(Wallet::class);
    }

    public function mainWallet(): HasOne
    {
        return $this->hasOne(Wallet::class)->where('wallet_type', 'MAIN');
    }

    public function kycDocuments(): HasMany
    {
        return $this->hasMany(KycDocument::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    public function merchants(): HasMany
    {
        return $this->hasMany(Merchant::class, 'owner_user_id');
    }

    public function appNotifications(): HasMany
    {
        return $this->hasMany(UserNotification::class);
    }

    public function balanceLimit(): int
    {
        return $this->kyc_status === 'VERIFIED'
            ? (int) config('sakukilat.verified_balance_limit', 20_000_000)
            : (int) config('sakukilat.unverified_balance_limit', 2_000_000);
    }
}
