-- =========================================================
-- Block 8650 — Plan-Based Email Limits + Usage Badge (Starter / Growth / Domination Enforcement)
-- =========================================================

-- 1) Workspace Subscriptions Table
-- Keyed by owner_id (auth.users.id) to track active plan + billing period
create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null, -- 'starter' | 'growth' | 'domination'
  stripe_customer_id text null,
  stripe_subscription_id text null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_subscriptions_owner_id_idx
  on public.workspace_subscriptions(owner_id);

-- Add updated_at trigger
create or replace function set_workspace_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_workspace_subscriptions_updated_at
  on public.workspace_subscriptions;

create trigger trg_workspace_subscriptions_updated_at
before update on public.workspace_subscriptions
for each row
execute procedure set_workspace_subscriptions_updated_at();

-- RLS policies
alter table public.workspace_subscriptions enable row level security;

-- Users can read their own subscription
drop policy if exists workspace_subscriptions_owner_read on public.workspace_subscriptions;
create policy workspace_subscriptions_owner_read
  on public.workspace_subscriptions
  for select
  using (owner_id = auth.uid());

-- Service role can manage all (for webhooks and jobs)
drop policy if exists workspace_subscriptions_service_all on public.workspace_subscriptions;
create policy workspace_subscriptions_service_all
  on public.workspace_subscriptions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2) Add cancel_reason column to outbound_emails
alter table public.outbound_emails
  add column if not exists cancel_reason text;

-- Index for cancel_reason lookups (useful for filtering canceled emails by reason)
create index if not exists idx_outbound_emails_cancel_reason
  on public.outbound_emails(cancel_reason)
  where cancel_reason is not null;

























































