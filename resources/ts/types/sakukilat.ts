export interface UserProfile {
  id: string;
  phone_number: string;
  full_name: string;
  email?: string | null;
  kyc_status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  role: 'USER' | 'MERCHANT' | 'ADMIN' | 'SYSTEM';
  biometric_enabled: boolean;
  device_id?: string | null;
  account_status?: string;
}

export interface DemoPersona {
  id: string;
  phone_number: string;
  email?: string | null;
  full_name: string;
  kyc_status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  role: string;
}

export interface UserNotification {
  id: string;
  user_id: string;
  channel: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  wallet_type: 'MAIN' | 'POCKET' | 'MERCHANT_SETTLEMENT' | string;
  name: string;
  category_key?: string | null;
  balance: number | string;
  target_amount?: number | string | null;
  currency: string;
  is_locked: boolean;
}

export interface TopupOrder {
  id: string;
  user_id: string;
  channel: string;
  channel_label: string;
  va_number: string;
  amount: number | string;
  admin_fee: number | string;
  status: 'PENDING' | 'PAID' | 'REJECTED';
  external_ref: string;
  paid_at?: string | null;
  created_at?: string;
}

export interface TopupChannelConfig {
  label: string;
  prefix: string;
  fee: number;
  kind: 'VA' | 'RETAIL' | 'DEBIT';
}

export interface BiFastQuota {
  used_this_month: number;
  free_quota: number;
  remaining_free: number;
}

export interface WalletSummary {
  main_balance: number;
  pockets_total: number;
  total_balance: number;
  balance_limit: number;
  kyc_status: string;
  bifast_quota: BiFastQuota;
  main_wallet: Wallet | null;
  pockets: Wallet[];
  wallets: Wallet[];
  topup_orders: TopupOrder[];
}

export interface TransactionRecord {
  id: string;
  reference_number: string;
  transaction_type: string;
  status: string;
  amount: number | string;
  admin_fee?: number | string;
  total_amount: number | string;
  title: string;
  category: string;
  direction?: 'IN' | 'OUT' | 'INTERNAL';
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface AnalyticsCategory {
  category: string;
  amount: number;
  share_percent: number;
}

export interface DailySeriesItem {
  label: string;
  date_iso: string;
  out_amount: number;
  in_amount: number;
}

export interface AnalyticsSummary {
  total_in: number;
  total_out: number;
  net_flow: number;
  transaction_count: number;
  categories: AnalyticsCategory[];
  daily_series: DailySeriesItem[];
}

export interface QrisPreset {
  id: string;
  label: string;
  badge: string;
  payload: string;
}

export interface QrisDecodeResult {
  kind: 'QRIS' | 'PROFILE';
  inquiry_id?: string;
  nmid?: string;
  merchant_name?: string;
  merchant_city?: string;
  category?: string;
  is_dynamic?: boolean;
  amount?: number | null;
  admin_fee?: number;
  phone_number?: string;
  masked_name?: string;
}

export interface PpobProduct {
  code: string;
  category: string;
  name: string;
  provider: string;
  base_price: number;
  admin_fee: number;
  description: string;
}

export interface PpobInquiry {
  product: PpobProduct;
  customer_number: string;
  customer_name: string;
  period: string;
  base_price: number;
  admin_fee: number;
  total_payable: number;
}

export interface SplitBillParticipant {
  id: string;
  user_id: string | null;
  display_name: string;
  phone_number: string;
  share_amount: number;
  status: 'PENDING' | 'PAID';
}

export interface SplitBill {
  id: string;
  creator_user_id: string;
  creator_name: string;
  title: string;
  split_mode: 'EQUAL' | 'ITEMIZED';
  total_amount: number;
  collected_amount: number;
  status: 'OPEN' | 'PARTIAL' | 'SETTLED';
  created_at: string;
  participants: SplitBillParticipant[];
}

export interface MerchantItem {
  id: string;
  nmid: string;
  merchant_name: string;
  merchant_city: string;
  category: string;
  category_scale: string;
  mdr_bps: number;
  settlement_wallet_id: string;
  balance: number;
  static_qris_payload: string;
}

export interface MerchantDashboard {
  is_owner: boolean;
  total_settlement_balance: number;
  total_qris_gross: number;
  merchants: MerchantItem[];
  incoming_qris: TransactionRecord[];
  settlements: TransactionRecord[];
}

export interface AdminOverview {
  ledger_invariant: {
    balanced: boolean;
    total_debit: number;
    total_credit: number;
    discrepancy: number;
    total_entries: number;
  };
  system_wallets: Wallet[];
  kyc_queue: Array<{
    id: string;
    full_name_ktp: string;
    status: string;
    rejection_reason?: string | null;
    user?: { id: string; phone_number: string } | null;
  }>;
  outbox_events: Array<{
    id: number | string;
    topic: string;
    aggregate_id: string;
    status: string;
    created_at: string;
  }>;
  recent_ledger_entries: Array<{
    id: number | string;
    entry_type: 'DEBIT' | 'CREDIT';
    amount: number | string;
    running_balance: number | string;
    description: string;
    transaction?: { id: string; reference_number: string } | null;
    wallet?: { id: string; name: string } | null;
  }>;
  recent_transactions: Array<TransactionRecord & { user?: { id: string; full_name: string } | null }>;
}

