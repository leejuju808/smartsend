-- Block 15000 — Plan Limits + Send Quotas v1
-- Enforce Starter / Growth / Domination Limits → Make Billing Real

-- Add plan usage tracking fields to workspaces
alter table public.workspaces
  add column if not exists plan_emails_sent_this_period int not null default 0,
  add column if not exists plan_period_start timestamptz,
  add column if not exists plan_period_end timestamptz;

-- Ensure plan_key defaults to 'starter' if null (migrate 'free' to 'starter')
update public.workspaces
set plan_key = 'starter'
where plan_key is null or plan_key = 'free';

-- Migrate existing email_used_this_period to plan_emails_sent_this_period if needed
update public.workspaces
set plan_emails_sent_this_period = coalesce(email_used_this_period, 0)
where plan_emails_sent_this_period = 0 and email_used_this_period is not null;

-- Migrate billing_period_ends_at to plan_period_end if needed
update public.workspaces
set plan_period_end = billing_period_ends_at
where plan_period_end is null and billing_period_ends_at is not null;

-- Create RPC function to atomically increment email usage
create or replace function increment_workspace_email_usage(
  p_workspace_id uuid,
  p_increment int
)
returns void
language plpgsql
security definer
as $$
begin
  update public.workspaces
  set plan_emails_sent_this_period = coalesce(plan_emails_sent_this_period, 0) + p_increment
  where id = p_workspace_id;
end;
$$;

grant execute on function increment_workspace_email_usage(uuid, int) to authenticated;

-- Create index for period queries (for reset cron)
create index if not exists idx_workspaces_plan_period_end 
  on public.workspaces(plan_period_end) 
  where plan_period_end is not null;

