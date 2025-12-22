alter table if not exists public.meeting_prefs
  add column if not exists start_hour int not null default 9,
  add column if not exists end_hour int not null default 17,
  add column if not exists buffer_min int not null default 15;

create or replace view public.v_campaign_prefs as
select
  c.id as campaign_id,
  mp.duration_min,
  coalesce(mp.tz, 'America/Los_Angeles') as tz,
  mp.workdays,
  mp.start_hour,
  mp.end_hour,
  mp.buffer_min
from public.campaigns c
left join public.meeting_prefs mp on mp.campaign_id = c.id;




