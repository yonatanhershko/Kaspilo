/**
 * Database types for the Kaspilo Supabase schema.
 * Source of truth is supabase/migrations. After a schema change, regenerate
 * (Supabase "generate TypeScript types") and bring this file in line.
 */
export type UserRole = 'client' | 'admin';
export type AccountStatus = 'pending_approval' | 'active' | 'expired' | 'rejected';
export type AccessPlan = 'paid' | 'vip' | 'family';
/** How long the admin opens access for: 12 = one year (365 days), 2 = two calendar months. */
export type AccessMonths = 12 | 2;

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: AccountStatus;
  plan: AccessPlan | null;
  approved_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  /** Never counted in analytics (the owner's test accounts). Set by hand. */
  analytics_excluded: boolean;
};

export type SubscriptionEvent = {
  id: number;
  user_id: string;
  actor_id: string | null;
  action: 'approve' | 'reject' | 'extend' | 'set_plan' | 'resubmit' | 'expire';
  plan: AccessPlan | null;
  old_expires_at: string | null;
  new_expires_at: string | null;
  created_at: string;
};

/** A ready-made notification, as the admin dropdown shows it. */
export type NotificationKind =
  | 'expiry_30'
  | 'expiry_7'
  | 'expiry_1'
  | 'expiry_0'
  | 'inactive_1'
  | 'inactive_2'
  | 'inactive_3';
export type NotificationText = { title: string; body: string };
export type NotificationCatalogItem = { kind: NotificationKind; he: NotificationText; en: NotificationText };
/** Who a manual send would reach. */
export type PushAudience = {
  users: number;
  users_with_device: number;
  /** Devices that would get this kind. */
  devices: number;
  /** Registered devices where the user switched this kind off: they get nothing. */
  off_devices: number;
};

export type DashboardStats = {
  total_users: number;
  active_subscribers: number;
  pending_approvals: number;
  expiring_soon: number;
};

/** Events the app sends. sign-up completed is recorded by the database itself. */
export type AnalyticsEventName = 'first_open' | 'signup_started' | 'first_app_entry' | 'app_open';

/** One Israel-time day of product analytics (docs/spec.md "Analytics"). */
export type AnalyticsDay = {
  day: string;
  dau: number;
  wau: number;
  mau: number;
  new_users: number;
  returning_users: number;
  first_opens: number;
  signups_started: number;
  signups_completed: number;
  approved: number;
  first_entries: number;
  /** Active users that day by the device of their last app open. */
  dau_ios: number;
  dau_android: number;
};

/** A user seen on both counts once, by the device of their last app open in the range. */
export type PlatformSplit = {
  active_ios: number;
  active_android: number;
  first_open_ios: number;
  first_open_android: number;
};

/** A weekly cohort by first app entry. dN = came back exactly N days later, out of dN_eligible. */
export type RetentionCohort = {
  week: string;
  users: number;
  d1: number;
  d1_eligible: number;
  d7: number;
  d7_eligible: number;
  d30: number;
  d30_eligible: number;
};

export type AnalyticsReport = {
  today: string;
  platforms: PlatformSplit;
  days: AnalyticsDay[];
  retention: RetentionCohort[];
  not_started: number;
};

export type TransactionType = 'income' | 'expense';
export type RepeatKind = 'recurring' | 'installments';
export type RepeatFrequency = 'weekly' | 'monthly' | 'yearly';

export type UserSettings = {
  user_id: string;
  currency: 'ILS' | 'USD' | 'EUR';
  /** Unused since wallets: read Wallet.month_start_day. */
  month_start_day: number;
  /** Unused since wallets: read Wallet.overall_budget. */
  overall_budget: number | null;
  daily_reminder_enabled: boolean;
  daily_reminder_time: string;
  purchase_notifications_enabled: boolean;
  updated_at: string;
};

/** A separate book of money. Up to 4 per user (docs/spec.md "Wallets"). */
export type Wallet = {
  id: string;
  user_id: string;
  /** null for the untouched first wallet: show the translated default_key */
  name: string | null;
  default_key: 'personal' | null;
  color: string;
  icon: string;
  sort_order: number;
  month_start_day: number;
  /** minor units; null = no overall budget */
  overall_budget: number | null;
  created_at: string;
};

export const WALLET_LIMIT = 4;

export type Category = {
  id: string;
  user_id: string;
  wallet_id: string;
  type: TransactionType;
  /** null for an untouched default category: show the translated default_key */
  name: string | null;
  default_key: string | null;
  icon: string;
  color: string;
  /** minor units; expense categories only */
  monthly_budget: number | null;
  sort_order: number;
  archived: boolean;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  wallet_id: string;
  type: TransactionType;
  /** minor units, always positive */
  amount: number;
  description: string;
  /** calendar date, YYYY-MM-DD */
  date: string;
  category_id: string;
  recurring_rule_id: string | null;
  created_at: string;
};

export type RecurringRule = {
  id: string;
  user_id: string;
  wallet_id: string;
  kind: RepeatKind;
  type: TransactionType;
  category_id: string;
  description: string;
  amount: number;
  frequency: RepeatFrequency;
  start_date: string;
  end_date: string | null;
  installments_count: number | null;
  occurrences_generated: number;
  active: boolean;
  created_at: string;
};

export type Goal = {
  id: string;
  user_id: string;
  wallet_id: string;
  name: string;
  target_amount: number;
  icon: string;
  /** Set when the user deleted the goal but kept its deposits. */
  archived_at: string | null;
  created_at: string;
};

export type GoalDeposit = {
  id: string;
  user_id: string;
  wallet_id: string;
  goal_id: string;
  amount: number;
  date: string;
  created_at: string;
  /** 'new' = set aside now, comes off the balance. 'existing' = saved before, counts toward the goal only. */
  source: DepositSource;
};

export type DepositSource = 'new' | 'existing';

/** One row of `wallet_history`: a transaction (`kind` 'tx') or a goal deposit (`kind` 'deposit'). */
export type HistoryRow = {
  kind: 'tx' | 'deposit';
  id: string;
  date: string;
  created_at: string;
  /** null for a deposit */
  type: TransactionType | null;
  amount: number;
  description: string;
  /** null for a deposit */
  category_id: string | null;
  recurring_rule_id: string | null;
  /** null for a transaction */
  goal_id: string | null;
  wallet_id: string;
  user_id: string;
  /** A deposit's source; 'new' for a transaction. */
  source: DepositSource;
};

export type CategoryTotal = { category_id: string; type: TransactionType; total: number; count: number };
export type GoalTotal = { goal_id: string; saved: number };

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Pick<Profile, 'id' | 'email'> & Partial<Profile>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      subscription_events: {
        Row: SubscriptionEvent;
        Insert: Pick<SubscriptionEvent, 'user_id' | 'action'> & Partial<SubscriptionEvent>;
        Update: Partial<SubscriptionEvent>;
        Relationships: [];
      };
      user_settings: Table<UserSettings, 'user_id'>;
      wallets: Table<Wallet, 'user_id'>;
      categories: Table<Category, 'type'>;
      transactions: Table<Transaction, 'type' | 'amount' | 'category_id'>;
      recurring_rules: Table<RecurringRule, 'kind' | 'type' | 'category_id' | 'amount' | 'start_date'>;
      goals: Table<Goal, 'name' | 'target_amount'>;
      goal_deposits: Table<GoalDeposit, 'goal_id' | 'amount'>;
    };
    Views: { [_ in never]: never };
    Functions: {
      admin_approve_user: {
        Args: { p_user_id: string; p_plan?: AccessPlan; p_months?: AccessMonths };
        Returns: Profile;
      };
      admin_reject_user: { Args: { p_user_id: string }; Returns: Profile };
      admin_extend_user: { Args: { p_user_id: string; p_months?: AccessMonths }; Returns: Profile };
      admin_set_plan: { Args: { p_user_id: string; p_plan: AccessPlan }; Returns: Profile };
      admin_dashboard_stats: { Args: Record<never, never>; Returns: DashboardStats };
      admin_analytics: { Args: { p_from: string; p_to: string }; Returns: AnalyticsReport };
      track_event: {
        Args: {
          p_name: AnalyticsEventName;
          p_device_id: string | null;
          p_platform: string | null;
          p_app_version: string | null;
          p_occurred_at: string;
        };
        Returns: undefined;
      };
      admin_notification_catalog: { Args: Record<never, never>; Returns: NotificationCatalogItem[] };
      admin_push_audience: { Args: { p_user_id?: string | null; p_kind?: string | null }; Returns: PushAudience };
      admin_send_notification: {
        Args: { p_user_id: string | null; p_kind: string; p_title?: string | null; p_body?: string | null };
        Returns: number;
      };
      admin_send_purchase_test: {
        Args: { p_user_id: string | null; p_amount_minor: number; p_merchant: string };
        Returns: number;
      };
      request_approval: { Args: Record<never, never>; Returns: Profile };
      has_access: { Args: Record<never, never>; Returns: boolean };
      is_admin: { Args: Record<never, never>; Returns: boolean };
      materialize_recurring: { Args: Record<never, never>; Returns: number };
      create_recurring: {
        Args: {
          p_type: TransactionType;
          p_category_id: string;
          p_description: string;
          p_amount: number;
          p_frequency: RepeatFrequency;
          p_start_date: string;
          p_end_date?: string | null;
        };
        Returns: string;
      };
      create_installments: {
        Args: {
          p_type: TransactionType;
          p_category_id: string;
          p_description: string;
          p_total: number;
          p_count: number;
          p_first_date: string;
        };
        Returns: string;
      };
      wallet_history: {
        Args: {
          p_wallet_id: string;
          p_today: string;
          p_upcoming?: boolean;
          p_since?: string | null;
          p_cursor_date?: string | null;
          p_cursor_at?: string | null;
          p_cursor_id?: string | null;
          p_limit?: number;
        };
        Returns: HistoryRow[];
      };
      category_totals: { Args: { p_wallet_id: string; p_from: string; p_to: string }; Returns: CategoryTotal[] };
      create_wallet: { Args: { p_name: string; p_color: string; p_icon: string }; Returns: Wallet };
      delete_wallet: { Args: { p_wallet_id: string }; Returns: undefined };
      goal_totals: { Args: Record<never, never>; Returns: GoalTotal[] };
      delete_account: { Args: Record<never, never>; Returns: undefined };
      register_push_token: {
        Args: { p_token: string; p_platform: string; p_language: string; p_subscription_reminders: boolean };
        Returns: undefined;
      };
      unregister_push_token: { Args: { p_token: string }; Returns: undefined };
    };
    Enums: {
      user_role: UserRole;
      account_status: AccountStatus;
      access_plan: AccessPlan;
      transaction_type: TransactionType;
      repeat_kind: RepeatKind;
      repeat_frequency: RepeatFrequency;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
