<?php

return [
    'unverified_balance_limit' => 2_000_000,
    'verified_balance_limit' => 20_000_000,
    'bifast_monthly_free_quota' => 10,
    'bifast_admin_fee' => 2_500,
    'merchant_settlement_fee' => 2_500,
    'otp_ttl_seconds' => 180,
    'lockout_seconds' => 900,
    'max_otp_attempts' => 3,
    'max_pin_attempts' => 5,
    'tx_auth_ttl_seconds' => 60,
    'webhook_replay_skew_seconds' => 30,
    'webhook_hmac_secret' => env('SAKUKILAT_WEBHOOK_HMAC_SECRET', 'sakukilat-va-webhook-hmac-secret-dev-2026'),
    'sandbox_otp_preview' => (bool) env('SAKUKILAT_SANDBOX_OTP', true),
    'genesis_reserve' => 50_000_000_000,
];
