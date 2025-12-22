-- /supabase/migrations/20251025_billing.sql

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  plan text not null,                      -- e.g. 'starter','pro','scale'
  status text not null,                    -- trialing|active|past_due|canceled|incomplete|unpaid
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists ux_billing_ws on public.billing_subscriptions(workspace_id);

alter table public.billing_subscriptions enable row level security;

create policy "members can view their workspace subscription"
on public.billing_subscriptions
for select using ( public.is_workspace_member(workspace_id) );

create policy "admins can manage their workspace subscription"
on public.billing_subscriptions
for all using ( public.is_workspace_admin(workspace_id) )
with check ( public.is_workspace_admin(workspace_id) );