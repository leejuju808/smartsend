-- Block 16: Growth Loops (Referrals + Templates + Onboarding)
-- Creates enhanced referral tracking, templates gallery, and onboarding checklist

-- ============================================================================
-- 1) ENHANCED REFERRALS SYSTEM
-- ============================================================================

-- Enhanced referrals table with additional tracking fields
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_email text not null,
  referred_user_id uuid references auth.users(id) on delete set null,
  status text default 'pending' check (status in ('pending', 'activated', 'rewarded')),
  reward_amount numeric default 0,
  created_at timestamptz default now(),
  converted_at timestamptz,
  credited_at timestamptz
);

-- Indexes for referrals
create index if not exists idx_referrals_referrer_id on public.referrals(referrer_id);
create index if not exists idx_referrals_referred_email on public.referrals(referred_email);
create index if not exists idx_referrals_status on public.referrals(status);
create index if not exists idx_referrals_referred_user_id on public.referrals(referred_user_id);
create index if not exists idx_referrals_created_at on public.referrals(created_at desc);

-- RLS for referrals
alter table public.referrals enable row level security;

drop policy if exists "Users view own referrals" on public.referrals;
create policy "Users view own referrals" on public.referrals
  for select
  using (auth.uid() = referrer_id);

-- Add referral credits to profiles if not exists
alter table public.profiles
  add column if not exists referral_credits numeric default 0;

-- Increment credits function
create or replace function public.increment_user_credit(user_id uuid, amount numeric)
returns void
language sql
security definer
as $$
  update public.profiles
  set referral_credits = coalesce(referral_credits, 0) + amount
  where id = user_id;
$$;

-- Grant execute
grant execute on function public.increment_user_credit to authenticated;

-- ============================================================================
-- 2) REFERRAL STATS VIEW
-- ============================================================================

create or replace view public.v_referral_stats as
select
  r.referrer_id,
  count(*) filter (where r.status = 'pending') as pending_count,
  count(*) filter (where r.status = 'activated') as activated_count,
  count(*) filter (where r.status = 'rewarded') as rewarded_count,
  sum(r.reward_amount) as total_rewards,
  count(*) as total_referrals,
  max(r.created_at) as last_referral_at
from public.referrals r
group by r.referrer_id;

grant select on public.v_referral_stats to authenticated;

-- ============================================================================
-- 3) TEMPLATES TABLE (Enhanced for Gallery)
-- ============================================================================

-- Enhanced templates table for public gallery
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  is_public boolean default false,
  name text not null,
  category text,
  subject text not null,
  body text not null,
  likes integer default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for templates
create index if not exists idx_templates_is_public on public.templates(is_public) where is_public = true;
create index if not exists idx_templates_category on public.templates(category);
create index if not exists idx_templates_likes on public.templates(likes desc);
create index if not exists idx_templates_created_by on public.templates(created_by);

-- RLS for templates
alter table public.templates enable row level security;

drop policy if exists "Public templates visible to all" on public.templates;
create policy "Public templates visible to all" on public.templates
  for select
  using (is_public = true or created_by = auth.uid());

drop policy if exists "Users can insert templates" on public.templates;
create policy "Users can insert templates" on public.templates
  for insert
  with check (auth.uid() = created_by);

drop policy if exists "Users can update own templates" on public.templates;
create policy "Users can update own templates" on public.templates
  for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ============================================================================
-- 4) ONBOARDING SYSTEM
-- ============================================================================

-- Onboarding items table (configurable checklist)
create table if not exists public.onboarding_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  order_index integer not null default 0,
  description text,
  created_at timestamptz default now()
);

-- User onboarding progress tracking
create table if not exists public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null references public.onboarding_items(key) on delete cascade,
  completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, item_key)
);

-- Indexes for onboarding
create index if not exists idx_onboarding_progress_user_id on public.onboarding_progress(user_id);
create index if not exists idx_onboarding_progress_item_key on public.onboarding_progress(item_key);
create index if not exists idx_onboarding_items_order on public.onboarding_items(order_index);

-- RLS for onboarding
alter table public.onboarding_items enable row level security;
alter table public.onboarding_progress enable row level security;

drop policy if exists "Onboarding items visible to all" on public.onboarding_items;
create policy "Onboarding items visible to all" on public.onboarding_items
  for select
  using (true);

drop policy if exists "Users view own progress" on public.onboarding_progress;
create policy "Users view own progress" on public.onboarding_progress
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users update own progress" on public.onboarding_progress;
create policy "Users update own progress" on public.onboarding_progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 5) SEED DATA
-- ============================================================================

-- Insert default onboarding items
insert into public.onboarding_items (key, title, order_index, description)
values
  ('connect_email', 'Connect your email account', 1, 'Link your Gmail or Outlook to start sending'),
  ('import_contacts', 'Import your first contacts', 2, 'Upload your lead list via CSV or API'),
  ('create_template', 'Create your first template', 3, 'Build a reusable email template'),
  ('send_campaign', 'Send your first campaign', 4, 'Launch your first outreach campaign'),
  ('invite_teammate', 'Invite a teammate', 5, 'Grow your team and collaborate')
on conflict (key) do nothing;

-- Insert sample public templates
insert into public.templates (is_public, name, category, subject, body, likes, created_by)
values
  (
    true,
    'Speed-to-Lead (Home Services)',
    'Local SMB',
    'Quick question about yesterday''s quote',
    'Hi {{first_name}},

We help {{company}} respond to new form leads in under 60 seconds (SMS + email), so you book more jobs without chasing.

Would a quick 10-min walkthrough help?

– {{sender}}',
    32,
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    true,
    'B2B SaaS Trial→Paid Nudge',
    'SaaS',
    'Shall I extend your trial?',
    'Hey {{first_name}},

Noticed you tested {{product}} to automate {{pain}}. Want me to unlock 14 more days and ship a prebuilt workflow so you see value today?

– {{sender}}',
    18,
    '00000000-0000-0000-0000-000000000000'
  )
on conflict do nothing;

-- ============================================================================
-- 6) HELPER FUNCTIONS
-- ============================================================================

-- Track referral conversion
create or replace function public.track_referral_conversion(
  p_referred_user_id uuid,
  p_referrer_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.referrals
  set status = 'activated',
      converted_at = now()
  where referred_user_id = p_referred_user_id
    and referrer_id = p_referrer_id
    and status = 'pending';
end;
$$;

grant execute on function public.track_referral_conversion to authenticated;

-- Reward referrer
create or replace function public.reward_referrer(
  p_referral_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
as $$
declare
  v_referrer_id uuid;
begin
  -- Get referrer ID
  select referrer_id into v_referrer_id
  from public.referrals
  where id = p_referral_id;

  if v_referrer_id is null then
    raise exception 'Referral not found';
  end if;

  -- Update referral status and reward
  update public.referrals
  set status = 'rewarded',
      reward_amount = p_amount,
      credited_at = now()
  where id = p_referral_id;

  -- Increment user credits
  perform public.increment_user_credit(v_referrer_id, p_amount);
end;
$$;

grant execute on function public.reward_referrer to authenticated;

-- Get user onboarding completion rate
create or replace function public.get_onboarding_completion_rate(p_user_id uuid)
returns numeric
language plpgsql
security definer
as $$
declare
  v_total integer;
  v_completed integer;
  v_rate numeric;
begin
  select count(*) into v_total from public.onboarding_items;
  
  select count(*) into v_completed
  from public.onboarding_progress
  where user_id = p_user_id and completed = true;

  if v_total = 0 then
    return 0;
  end if;

  v_rate := (v_completed::numeric / v_total::numeric) * 100;
  return v_rate;
end;
$$;

grant execute on function public.get_onboarding_completion_rate to authenticated;

