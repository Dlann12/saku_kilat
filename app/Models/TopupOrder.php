<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TopupOrder extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'user_id',
        'channel',
        'channel_label',
        'va_number',
        'amount',
        'admin_fee',
        'status',
        'external_ref',
        'failure_reason',
        'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'admin_fee' => 'float',
            'paid_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
