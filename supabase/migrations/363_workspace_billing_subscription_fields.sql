-- Block 363: Subscription Status + Trial Banner v1
-- Extend workspace_billing_state with subscription metadata

alter table workspace_billing_state
  add column if not exists subscription_status text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists cancel_at timestamptz,
  add column if not exists current_period_end timestamptz;





