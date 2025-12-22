-- =========================================================
-- BLOCK 268000 — SmartSend Payment Moment v1
-- "Charge When Value Is Proven"
--
-- Canonical rule (v1):
-- - Full access until a roofing company has sent >= 3 estimates/proposals
-- - After that trigger, gate actions unless subscription is ACTIVE
-- =========================================================

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.roofing_companies(id) on delete cascade,

  stripe_customer_id text,
  stripe_subscription_id text,

  plan text not null default 'starter' check (plan in ('starter', 'growth', 'domination')),
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'canceled')),

  started_at timestamptz,
  renewed_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint company_subscriptions_company_id_unique unique (company_id)
);

create index if not exists company_subscriptions_company_id_idx on public.company_subscriptions(company_id);
create index if not exists company_subscriptions_status_idx on public.company_subscriptions(status);
create index if not exists company_subscriptions_stripe_customer_idx on public.company_subscriptions(stripe_customer_id);
create index if not exists company_subscriptions_stripe_subscription_idx on public.company_subscriptions(stripe_subscription_id);

alter table public.company_subscriptions enable row level security;

-- Members of a roofing company can view that company's subscription
create policy "company members can view company_subscriptions"
  on public.company_subscriptions
  for select
  to authenticated
  using (public.is_company_member(company_id));

-- Members can create/update their own company subscription record (needed for checkout initialization)
create policy "company members can manage company_subscriptions"
  on public.company_subscriptions
  for insert
  to authenticated
  with check (public.is_company_member(company_id));

create policy "company members can update company_subscriptions"
  on public.company_subscriptions
  for update
  to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

-- Service role manages all rows (Stripe webhooks)
create policy "service_role can manage company_subscriptions"
  on public.company_subscriptions
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.set_company_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_company_subscriptions_updated_at on public.company_subscriptions;
create trigger trg_company_subscriptions_updated_at
before update on public.company_subscriptions
for each row
execute function public.set_company_subscriptions_updated_at();










