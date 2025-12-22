-- Org billing table
create table if not exists org_billing (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizations(id) on delete cascade unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text check (plan in ('free','starter','pro','agency')) default 'free',
  status text default 'inactive',
  current_period_end timestamptz,
  created_at timestamptz default now()
);

alter table org_billing enable row level security;

create policy "billing: org access"
on org_billing for select using (is_org_member(org_id));

create policy "billing: update self"
on org_billing for update using (is_org_member(org_id))
  with check (is_org_member(org_id));

-- Index for faster lookups
create index if not exists idx_org_billing_org_id on org_billing(org_id);
create index if not exists idx_org_billing_stripe_customer on org_billing(stripe_customer_id);

