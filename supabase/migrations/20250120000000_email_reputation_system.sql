-- Email Reputation Management System
-- Run this in your Supabase SQL editor

-- 1. Bounces + delivery events table
create table if not exists public.bounces (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  type text not null, -- hard|soft|complaint
  provider_message text,
  created_at timestamptz default now()
);

create index if not exists bounces_email_idx on public.bounces (email);
create index if not exists bounces_campaign_idx on public.bounces (campaign_id);
create index if not exists bounces_created_at_idx on public.bounces (created_at);

-- Enable RLS
alter table public.bounces enable row level security;

-- RLS policies for bounces
create policy "Users can view bounces for their campaigns" on public.bounces
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = bounces.campaign_id and c.user_id = auth.uid()
    )
  );

create policy "Service role can insert bounces" on public.bounces
  for insert with check (true);

-- 2. Profiles: add warmup + daily cap columns
alter table public.profiles
  add column if not exists daily_send_cap int default 200,
  add column if not exists warmup_level int default 1,
  add column if not exists last_campaign_id uuid references public.campaigns(id);

-- Create index for warmup lookups
create index if not exists idx_profiles_warmup on public.profiles (warmup_level, daily_send_cap);

-- 3. Auto-increment warmup level function
create or replace function public.increment_warmup()
returns void as $$
begin
  update public.profiles
  set warmup_level = least(warmup_level + 1, 30) -- cap at 30x
  where warmup_level < 30;
end;
$$ language plpgsql;

-- 4. Function to get daily send count for a user
create or replace function public.get_daily_send_count(p_user_id uuid)
returns int as $$
declare
  v_count int;
begin
  select coalesce(count(*), 0) into v_count
  from public.campaign_recipients cr
  join public.campaigns c on c.id = cr.campaign_id
  where c.user_id = p_user_id
    and cr.status = 'sent'
    and cr.sent_at >= date_trunc('day', now());
  
  return v_count;
end;
$$ language plpgsql stable;

-- 5. Function to check if user can send today
create or replace function public.can_send_today(p_user_id uuid)
returns table(can_send boolean, daily_cap int, warmup_level int, used_today int, allowed int) as $$
declare
  v_profile record;
  v_base_cap int := 50; -- starting daily cap
  v_allowed int;
begin
  -- Get profile info
  select daily_send_cap, warmup_level into v_profile
  from public.profiles
  where id = p_user_id;
  
  if not found then
    return query select false, 0, 0, 0, 0;
    return;
  end if;
  
  -- Warmup curve: scale daily cap with warmup level
  v_allowed := least(v_base_cap * (v_profile.warmup_level or 1), v_profile.daily_send_cap or 200);
  
  return query
  select 
    public.get_daily_send_count(p_user_id) < v_allowed as can_send,
    v_profile.daily_send_cap as daily_cap,
    v_profile.warmup_level as warmup_level,
    public.get_daily_send_count(p_user_id) as used_today,
    v_allowed as allowed;
end;
$$ language plpgsql stable;

-- 6. Add status column to campaign_recipients if not exists
alter table public.campaign_recipients
  add column if not exists status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped', 'bounced'));

-- 7. Create index for daily send counting
create index if not exists idx_campaign_recipients_sent_at on public.campaign_recipients (sent_at) where sent_at is not null; 