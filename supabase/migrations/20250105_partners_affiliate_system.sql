-- Partner & Affiliate Expansion System
-- Creates partners and partner_payouts tables for referral revenue engine

-- Create partners table
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.orgs(id) on delete cascade,
  role text default 'affiliate' check (role in ('affiliate', 'partner', 'reseller')),
  commission_rate numeric default 0.20, -- 20% default commission
  referral_code text unique not null,
  total_earned numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create partner_payouts table
create table if not exists public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  amount numeric not null,
  period text not null, -- e.g., 'Nov-2025'
  status text default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_partners_user_id on public.partners(user_id);
create index if not exists idx_partners_org_id on public.partners(org_id);
create index if not exists idx_partners_referral_code on public.partners(referral_code);

create index if not exists idx_partner_payouts_partner_id on public.partner_payouts(partner_id);
create index if not exists idx_partner_payouts_status on public.partner_payouts(status);
create index if not exists idx_partner_payouts_period on public.partner_payouts(period);

-- Create RPC function to increment partner earnings
create or replace function public.increment_partner_earnings(partner_id uuid, amount numeric)
returns void
language sql
security definer
as $$
  update public.partners 
  set total_earned = total_earned + amount,
      updated_at = now()
  where id = partner_id;
$$;

-- Create function to calculate monthly period string
create or replace function public.get_monthly_period(ts timestamptz)
returns text
language sql
immutable
as $$
  select to_char(ts, 'Mon-YYYY');
$$;

-- Enable RLS
alter table public.partners enable row level security;
alter table public.partner_payouts enable row level security;

-- RLS Policies: Partners can view their own data
drop policy if exists "Partners view own data" on public.partners;
create policy "Partners view own data" on public.partners
  for select
  using (auth.uid() = user_id);

-- Allow service role to manage partners
grant all on public.partners to service_role;
grant all on public.partner_payouts to service_role;

-- Grant execute permissions on RPC
grant execute on function public.increment_partner_earnings to service_role;
grant execute on function public.get_monthly_period to authenticated;

-- Helper view for partner statistics
create or replace view public.v_partner_stats as
select 
  p.id,
  p.user_id,
  p.role,
  p.commission_rate,
  p.total_earned,
  count(po.id) as total_payouts,
  sum(case when po.status = 'paid' then po.amount else 0 end) as total_paid,
  sum(case when po.status = 'pending' then po.amount else 0 end) as total_pending
from public.partners p
left join public.partner_payouts po on po.partner_id = p.id
group by p.id, p.user_id, p.role, p.commission_rate, p.total_earned;

grant select on public.v_partner_stats to authenticated;

-- Add referral tracking to track which referrals converted to paid
create table if not exists public.referral_conversions (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  subscription_id text, -- Stripe subscription ID
  amount numeric not null,
  commission_amount numeric not null,
  period text not null,
  created_at timestamptz default now()
);

create index if not exists idx_referral_conversions_referral_id on public.referral_conversions(referral_id);
create index if not exists idx_referral_conversions_partner_id on public.referral_conversions(partner_id);

grant all on public.referral_conversions to service_role;

comment on table public.partners is 'Partner/affiliate users with unique referral codes and commission rates';
comment on table public.partner_payouts is 'Monthly payouts tracking for partner earnings';
comment on table public.referral_conversions is 'Tracks which referrals converted to paid subscriptions';
comment on function public.increment_partner_earnings is 'Increments total_earned for a partner when a conversion happens';
comment on function public.get_monthly_period is 'Helper function to format timestamps as monthly period strings';

