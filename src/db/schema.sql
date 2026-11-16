CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(24) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160),
  pin_hash TEXT NOT NULL,
  pin_attempts INT NOT NULL DEFAULT 0,
  pin_locked_until TIMESTAMPTZ,
  biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  active_device_id VARCHAR(128),
  kyc_status VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (kyc_status IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED')),
  account_status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
    CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'SYSTEM')),
  role VARCHAR(16) NOT NULL DEFAULT 'USER'
    CHECK (role IN ('USER', 'MERCHANT', 'ADMIN', 'SYSTEM')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nik_encrypted TEXT NOT NULL,
  nik_hash VARCHAR(64) NOT NULL,
  full_name_ktp VARCHAR(120) NOT NULL,
  ktp_image_url TEXT NOT NULL,
  selfie_image_url TEXT NOT NULL,
  liveness_score NUMERIC(5,2) NOT NULL DEFAULT 98.50,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  rejection_reason TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_user_id ON kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_status ON kyc_documents(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_documents_verified_nik_hash
  ON kyc_documents(nik_hash) WHERE status = 'VERIFIED';

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_type VARCHAR(32) NOT NULL
    CHECK (wallet_type IN ('MAIN', 'POCKET', 'MERCHANT_SETTLEMENT', 'SYSTEM_ESCROW', 'SYSTEM_FEE', 'SYSTEM_PPOB', 'SYSTEM_GENESIS')),
  name VARCHAR(80) NOT NULL,
  category_key VARCHAR(32) NOT NULL DEFAULT 'main',
  balance NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  target_amount NUMERIC(15,2),
  daily_limit NUMERIC(15,2),
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_single_main_per_user
  ON wallets(user_id) WHERE wallet_type = 'MAIN';

CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nmid VARCHAR(32) NOT NULL UNIQUE,
  merchant_name VARCHAR(120) NOT NULL,
  merchant_city VARCHAR(80) NOT NULL,
  category VARCHAR(48) NOT NULL,
  category_scale VARCHAR(16) NOT NULL DEFAULT 'UMI'
    CHECK (category_scale IN ('UMI', 'UKE', 'UME', 'UBE')),
  mdr_bps INT NOT NULL DEFAULT 30,
  settlement_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_owner_user_id ON merchants(owner_user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  counterparty_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  reference_number VARCHAR(64) NOT NULL UNIQUE,
  transaction_type VARCHAR(24) NOT NULL
    CHECK (transaction_type IN ('GENESIS', 'TOPUP', 'TRANSFER_P2P', 'TRANSFER_BANK', 'QRIS', 'PPOB', 'POCKET_MOVE', 'SPLIT_BILL', 'MERCHANT_SETTLE')),
  status VARCHAR(16) NOT NULL DEFAULT 'SUCCESS'
    CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED')),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  admin_fee NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (admin_fee >= 0),
  total_amount NUMERIC(15,2) GENERATED ALWAYS AS (amount + admin_fee) STORED,
  title VARCHAR(140) NOT NULL,
  category VARCHAR(48) NOT NULL DEFAULT 'Lainnya',
  source_wallet_id UUID REFERENCES wallets(id),
  destination_wallet_id UUID REFERENCES wallets(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_counterparty_created ON transactions(counterparty_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  entry_type VARCHAR(8) NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  balance_before NUMERIC(15,2) NOT NULL,
  balance_after NUMERIC(15,2) NOT NULL,
  description VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_id ON ledger_entries(wallet_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_ledger_entries_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is strictly append-only; % is prohibited', TG_OP
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_ledger_update ON ledger_entries;
CREATE TRIGGER trg_prevent_ledger_update
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entries_mutation();

DROP TRIGGER IF EXISTS trg_prevent_ledger_delete ON ledger_entries;
CREATE TRIGGER trg_prevent_ledger_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entries_mutation();

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(128) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint VARCHAR(120) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_status INT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topup_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(32) NOT NULL,
  channel_label VARCHAR(80) NOT NULL,
  va_number VARCHAR(40) NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  admin_fee NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (admin_fee >= 0),
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'REJECTED')),
  external_ref VARCHAR(64) NOT NULL UNIQUE,
  failure_reason TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topup_orders_user_id ON topup_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS split_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(140) NOT NULL,
  split_mode VARCHAR(16) NOT NULL CHECK (split_mode IN ('EQUAL', 'ITEMIZED')),
  total_amount NUMERIC(15,2) NOT NULL CHECK (total_amount > 0),
  items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS split_bill_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_bill_id UUID NOT NULL REFERENCES split_bills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(120) NOT NULL,
  phone_number VARCHAR(24) NOT NULL,
  share_amount NUMERIC(15,2) NOT NULL CHECK (share_amount > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  paid_transaction_id UUID REFERENCES transactions(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_split_bill_participants_bill ON split_bill_participants(split_bill_id);
CREATE INDEX IF NOT EXISTS idx_split_bill_participants_user ON split_bill_participants(user_id);

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  topic VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(48) NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PENDING', 'PUBLISHED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_created ON outbox_events(created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(24) NOT NULL DEFAULT 'IN_APP',
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

