-- Deliverability Guard System
-- Automatic pause/resume for campaigns with high bounce or spam rates

-- A) Campaign flags
alter table public.campaigns
  add column if not exists paused_by_guard boolean default false,
  add column if not exists pause_reason text,
  add column if not exists paused_at timestamptz,
  add column if not exists resumed_at timestamptz;

-- B) Global defaults (override per campaign if you want later)
create table if not exists public.deliverability_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null => global default
  bounce_threshold numeric not null default 0.08,    -- 8%
  spam_threshold   numeric not null default 0.003,   -- 0.3%
  min_sample_sent  int     not null default 25,      -- don't judge if sample too small
  resume_padding   numeric not null default 0.7,      -- resume when rate < threshold * 0.7
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create unique constraint: one global default, one per user
create unique index if not exists idx_deliverability_settings_user 
  on public.deliverability_settings(user_id) where user_id is not null;

-- Ensure one global default row exists (use a trigger or manual insert)
-- For now, we'll rely on application logic to ensure only one global default
-- The unique index on user_id where not null will prevent duplicates per user

-- Insert global default if it doesn't exist
do $$
begin
  if not exists (select 1 from public.deliverability_settings where user_id is null) then
    insert into public.deliverability_settings (user_id) values (null);
  end if;
end $$;

-- C) 7-day health view (per campaign)
create or replace view public.v_campaign_health_7d as
with win as (
  select *
  from public.v_outbound_rollup
  where day >= (current_date - 6)  -- include today..today-6
),
agg as (
  select
    campaign_id,
    sum(sent)        as sent_7d,
    sum(delivered)   as delivered_7d,
    sum(clicks)      as clicks_7d,
    sum(opens)       as opens_7d,
    sum(bounces)     as bounces_7d,
    sum(spams)       as spams_7d
  from win
  group by campaign_id
)
select
  a.campaign_id,
  coalesce(a.sent_7d,0)::int        as sent_7d,
  coalesce(a.delivered_7d,0)::int   as delivered_7d,
  coalesce(a.opens_7d,0)::int       as opens_7d,
  coalesce(a.clicks_7d,0)::int      as clicks_7d,
  coalesce(a.bounces_7d,0)::int     as bounces_7d,
  coalesce(a.spams_7d,0)::int       as spams_7d,
  case when coalesce(a.sent_7d,0) > 0 then (a.bounces_7d::numeric / a.sent_7d) else 0 end as bounce_rate_7d,
  case when coalesce(a.sent_7d,0) > 0 then (a.spams_7d::numeric   / a.sent_7d) else 0 end as spam_rate_7d
from agg a;

-- D) Helper RPCs to pause/resume (server/owner-only can call; audited elsewhere)
create or replace function public.guard_pause_campaign(p_campaign uuid, p_reason text)
returns void 
language sql 
security definer 
set search_path=public 
as $$
  update public.campaigns
     set paused_by_guard = true,
         pause_reason = p_reason,
         paused_at = now()
   where id = p_campaign;
$$;

create or replace function public.guard_resume_campaign(p_campaign uuid)
returns void 
language sql 
security definer 
set search_path=public 
as $$
  update public.campaigns
     set paused_by_guard = false,
         pause_reason = null,
         resumed_at = now()
   where id = p_campaign;
$$;

-- Grant execute permissions
grant execute on function public.guard_pause_campaign(uuid, text) to service_role;
grant execute on function public.guard_resume_campaign(uuid) to service_role;

-- RLS for deliverability_settings
alter table public.deliverability_settings enable row level security;

create policy deliverability_settings_select on public.deliverability_settings
  for select to authenticated
  using (user_id is null or user_id = auth.uid());

create policy deliverability_settings_insert on public.deliverability_settings
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

create policy deliverability_settings_update on public.deliverability_settings
  for update to authenticated
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

-- Allow service role full access
create policy deliverability_settings_service_role on public.deliverability_settings
  for all to service_role
  using (true)
  with check (true);

