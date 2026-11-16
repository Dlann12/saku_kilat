<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class SplitBill extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'creator_user_id',
        'title',
        'split_mode',
        'total_amount',
        'items_json',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'total_amount' => 'float',
            'items_json' => 'array',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creator_user_id');
    }

    public function participants(): HasMany
    {
        return $this->hasMany(SplitBillParticipant::class);
    }
}
