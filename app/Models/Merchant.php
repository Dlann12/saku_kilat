<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class Merchant extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'owner_user_id',
        'nmid',
        'merchant_name',
        'merchant_city',
        'category',
        'category_scale',
        'mdr_bps',
        'settlement_wallet_id',
    ];

    protected function casts(): array
    {
        return [
            'mdr_bps' => 'integer',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function settlementWallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'settlement_wallet_id');
    }
}
