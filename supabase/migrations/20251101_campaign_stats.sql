-- Block 31: Analytics Dashboard - Campaign Events & Stats
-- This migration creates the campaign_events table and campaign_stats view for tracking
-- email opens, clicks, and replies with funnel visualization

-- Update campaign_events table if it exists, or create it
create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  event_type text check (event_type in ('sent','opened','clicked','replied')),
  provider text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Add columns if they don't exist (for existing tables)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_events' and column_name='team_id') then
    alter table public.campaign_events add column team_id uuid references public.teams(id) on delete cascade;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_events' and column_name='lead_id') then
    alter table public.campaign_events add column lead_id uuid references public.leads(id) on delete cascade;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_events' and column_name='provider') then
    alter table public.campaign_events add column provider text;
  end if;
  
  -- Ensure event_type constraint includes all needed types
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_events' and column_name='event_type') then
    -- Drop existing constraint if it exists
    alter table public.campaign_events drop constraint if exists campaign_events_event_type_check;
    -- Add new constraint
    alter table public.campaign_events add constraint campaign_events_event_type_check 
      check (event_type in ('sent','opened','clicked','replied'));
  end if;
end $$;

-- Indexes for performance
create index if not exists idx_campaign_events_campaign on public.campaign_events(campaign_id);
create index if not exists idx_campaign_events_type on public.campaign_events(event_type);
create index if not exists idx_campaign_events_lead on public.campaign_events(lead_id);
create index if not exists idx_campaign_events_team on public.campaign_events(team_id);
create index if not exists idx_campaign_events_created on public.campaign_events(created_at);

-- Daily rollup view
create or replace view public.campaign_stats as
select
  c.id as campaign_id,
  c.name as campaign_name,
  count(*) filter (where e.event_type='sent') as sent,
  count(*) filter (where e.event_type='opened') as opened,
  count(*) filter (where e.event_type='clicked') as clicked,
  count(*) filter (where e.event_type='replied') as replied
from public.campaigns c
left join public.campaign_events e on c.id = e.campaign_id
group by c.id, c.name;

-- RPC helper function for event trends (grouped by day)
create or replace function public.get_event_trend(
  p_start_date date default (current_date - interval '30 days'),
  p_end_date date default current_date
)
returns table(
  date date,
  sent int,
  opened int,
  clicked int,
  replied int
)
language sql
security definer
stable
as $$
  select
    date_trunc('day', created_at)::date as date,
    count(*) filter (where event_type='sent')::int as sent,
    count(*) filter (where event_type='opened')::int as opened,
    count(*) filter (where event_type='clicked')::int as clicked,
    count(*) filter (where event_type='replied')::int as replied
  from public.campaign_events
  where created_at >= p_start_date and created_at < p_end_date + interval '1 day'
  group by date_trunc('day', created_at)::date
  order by date;
$$;

-- Grant permissions
grant select on public.campaign_stats to authenticated;
grant execute on function public.get_event_trend(date, date) to authenticated;
grant select, insert on public.campaign_events to authenticated;

-- Enable RLS
alter table public.campaign_events enable row level security;

-- RLS policies
drop policy if exists "campaign_events_select_own_team" on public.campaign_events;
create policy "campaign_events_select_own_team" on public.campaign_events
  for select using (
    team_id is null or
    exists (
      select 1 from public.team_members tm
      where tm.team_id = campaign_events.team_id
      and tm.user_id = auth.uid()
    )
  );

drop policy if exists "campaign_events_insert_service" on public.campaign_events;
create policy "campaign_events_insert_service" on public.campaign_events
  for insert with check (true); -- Service role can insert via edge function

