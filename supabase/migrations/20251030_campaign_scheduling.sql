-- Campaign scheduling fields on campaigns

alter table public.campaigns
  add column if not exists send_start timestamptz,
  add column if not exists send_end   timestamptz,
  add column if not exists daily_window_start time,
  add column if not exists daily_window_end   time,
  add column if not exists days_of_week smallint[] default '{1,2,3,4,5}',
  add column if not exists rate_per_minute int default 30,
  add column if not exists is_paused boolean default false;


-- Workspace-wide safety limits (optional)
create table if not exists public.workspace_limits (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  hard_cap_per_day int not null default 500,
  burst_per_minute int not null default 60
);


-- Track daily sends per workspace (rolled by date)
create table if not exists public.workspace_send_counters (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ymd date not null,
  sent_count int not null default 0,
  primary key (workspace_id, ymd)
);


-- Helpful view: campaigns eligible "right now"
create or replace view public.campaigns_scheduling_window as
select
  c.*,
  (extract(dow from now() at time zone 'utc')::int) as dow_now,
  ((now() at time zone 'utc')::time) as t_now
from public.campaigns c
where coalesce(c.is_paused,false) = false
  and (c.send_start is null or now() >= c.send_start)
  and (c.send_end   is null or now() <= c.send_end)
  and (c.days_of_week is null or (extract(dow from now() at time zone 'utc')::int = any(c.days_of_week)))
  and (
     (c.daily_window_start is null and c.daily_window_end is null)
     or (
       c.daily_window_start is not null and c.daily_window_end is not null
       and ((now() at time zone 'utc')::time between c.daily_window_start and c.daily_window_end)
     )
  );

grant select on public.campaigns_scheduling_window to authenticated;


