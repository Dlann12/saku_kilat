<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class OutboxEvent extends Model
{
    protected $fillable = [
        'event_id',
        'topic',
        'aggregate_type',
        'aggregate_id',
        'payload',
        'status',
        'created_at',
        'updated_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
        ];
    }
}
