-- Block 337: Stripe Billing Integration v1
-- Subscription table + link to workspace_billing_limits

create table if not exists workspace_billing_subscriptions (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces(id) on delete cascade,

  stripe_customer_id text not null,
  stripe_subscription_id text,
  stripe_price_id text,
  plan_code text not null, -- e.g. "free", "starter", "pro"

  status text not null default 'inactive', -- trialing, active, past_due, canceled, incomplete...

  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists workspace_billing_subscriptions_workspace_uidx
  on workspace_billing_subscriptions(workspace_id);

create index if not exists workspace_billing_subscriptions_stripe_customer_idx
  on workspace_billing_subscriptions(stripe_customer_id);

create index if not exists workspace_billing_subscriptions_stripe_subscription_idx
  on workspace_billing_subscriptions(stripe_subscription_id);

create or replace function set_workspace_billing_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_workspace_billing_subscriptions_updated_at
  on workspace_billing_subscriptions;

create trigger trg_workspace_billing_subscriptions_updated_at
before update on workspace_billing_subscriptions
for each row
execute procedure set_workspace_billing_subscriptions_updated_at();

-- RLS policies
alter table workspace_billing_subscriptions enable row level security;

-- Service role can read/write (for webhooks)
drop policy if exists workspace_billing_subscriptions_service on workspace_billing_subscriptions;
create policy workspace_billing_subscriptions_service on workspace_billing_subscriptions
  for all to service_role
  using (true) with check (true);

-- Workspace members can read their workspace subscription
drop policy if exists workspace_billing_subscriptions_select on workspace_billing_subscriptions;
create policy workspace_billing_subscriptions_select on workspace_billing_subscriptions
  for select to authenticated
  using (
    exists (
      select 1 from team_members
      where workspace_id = workspace_billing_subscriptions.workspace_id
      and user_id = auth.uid()
      and status = 'active'
    )
    or exists (
      select 1 from workspace_members
      where workspace_id = workspace_billing_subscriptions.workspace_id
      and user_id = auth.uid()
    )
  );






