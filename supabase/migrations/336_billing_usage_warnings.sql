-- Block 336: Billing Overage Warnings v1
-- Add warning threshold and seat limits to workspace_billing_limits

-- Add warning_threshold_pct column (default 80%)
alter table workspace_billing_limits
  add column if not exists warning_threshold_pct integer not null default 80;

-- Add seats_allowed column (default 1)
alter table workspace_billing_limits
  add column if not exists seats_allowed integer not null default 1;






