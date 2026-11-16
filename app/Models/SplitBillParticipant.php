<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class SplitBillParticipant extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'split_bill_id',
        'user_id',
        'display_name',
        'phone_number',
        'share_amount',
        'status',
        'paid_transaction_id',
        'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'share_amount' => 'float',
            'paid_at' => 'datetime',
        ];
    }

    public function splitBill(): BelongsTo
    {
        return $this->belongsTo(SplitBill::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
