-- Campaign-level send window (recipient local time)
alter table public.campaigns
  add column if not exists send_window_start smallint not null default 8,   -- 0–23
  add column if not exists send_window_end smallint not null default 18,    -- 0–23 (exclusive)
  add column if not exists skip_weekends boolean not null default true;

-- Lead-level timezone (IANA, e.g., 'America/New_York')
alter table public.campaign_leads
  add column if not exists timezone text;  -- nullable; fallback to campaign default or 'Etc/UTC'

create index if not exists idx_cleads_tz on public.campaign_leads(campaign_id, timezone);

-- Ensure send_queue has meta column for blocking reasons
alter table public.send_queue
  add column if not exists meta jsonb default '{}'::jsonb;

-- SQL function to compute timezone offset in minutes
create or replace function public.get_tz_offset_minutes(tz_name text)
returns integer
language sql stable
as $$
  with
  now_utc as (select now() at time zone 'UTC' as ts),
  local as (select (select ts from now_utc) at time zone tz_name as ts)
  select extract(epoch from (
    (select ts from local) - (select ts from now_utc)
  ))::int / 60;
$$;

grant execute on function public.get_tz_offset_minutes(text) to anon, authenticated;

