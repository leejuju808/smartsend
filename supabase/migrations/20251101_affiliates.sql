-- Block 37: Affiliate + Referral System
-- Create affiliates table
create table if not exists affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  referral_code text unique not null,
  referral_url text,
  total_referrals int default 0,
  active_customers int default 0,
  earned_cents int default 0,
  paid_out_cents int default 0,
  created_at timestamptz default now()
);

-- Create affiliate_referrals table
create table if not exists affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references affiliates(id) on delete cascade,
  referred_email text,
  subscription_id text,
  amount_cents int,
  status text check (status in ('pending','active','cancelled','paid')) default 'pending',
  created_at timestamptz default now()
);

-- Create index on referral_code for fast lookups
create index if not exists idx_affiliates_referral_code on affiliates(referral_code);
create index if not exists idx_affiliates_user_id on affiliates(user_id);
create index if not exists idx_affiliate_referrals_affiliate_id on affiliate_referrals(affiliate_id);
create index if not exists idx_affiliate_referrals_subscription_id on affiliate_referrals(subscription_id);

-- RPC function to increment affiliate count
create or replace function increment_affiliate_count(aid uuid)
returns void language sql as $$
  update affiliates set total_referrals = total_referrals + 1 where id=aid;
$$;

-- Enable RLS
alter table affiliates enable row level security;
alter table affiliate_referrals enable row level security;

-- RLS Policies: Users can only see their own affiliate data
create policy "Users can view their own affiliate record" on affiliates
  for select using (auth.uid() = user_id);

create policy "Users can insert their own affiliate record" on affiliates
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own affiliate record" on affiliates
  for update using (auth.uid() = user_id);

-- RLS Policies for affiliate_referrals
create policy "Users can view referrals for their affiliate record" on affiliate_referrals
  for select using (
    affiliate_id in (
      select id from affiliates where user_id = auth.uid()
    )
  );

-- Service role can insert (for webhooks)
create policy "Service role can insert referrals" on affiliate_referrals
  for insert with check (true);

