-- Smart Send Analytics Database Schema
-- Run this in Supabase SQL editor to set up the analytics tables

-- Basic tables
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_events (
  id bigserial primary key,
  email_id uuid,
  campaign_id uuid references campaigns(id) on delete set null,
  event_type text check (event_type in ('sent','opened','clicked','bounced')) not null,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade
);

-- Add indexes for better query performance
create index if not exists idx_campaigns_user_id on public.campaigns(user_id);
create index if not exists idx_email_events_campaign_id on public.email_events(campaign_id);
create index if not exists idx_email_events_event_type on public.email_events(event_type);
create index if not exists idx_email_events_created_at on public.email_events(created_at);
create index if not exists idx_email_events_user_id on public.email_events(user_id);

-- Buckets RPC (daily/hourly by interval)
create or replace function public.email_event_buckets(from_ts timestamptz, to_ts timestamptz, bucket interval)
returns table (date text, sent int, opened int, clicked int, bounced int)
language sql as $$
  with series as (
    select generate_series(date_trunc('day', from_ts), date_trunc('day', to_ts), bucket) as ts
  ),
  agg as (
    select date_trunc('day', created_at) as day,
           sum((event_type='sent')::int)    as sent,
           sum((event_type='opened')::int)  as opened,
           sum((event_type='clicked')::int) as clicked,
           sum((event_type='bounced')::int) as bounced
    from email_events
    where created_at between from_ts and to_ts
    group by 1
  )
  select to_char(s.ts, 'YYYY-MM-DD') as date,
         coalesce(a.sent,0)    as sent,
         coalesce(a.opened,0)  as opened,
         coalesce(a.clicked,0) as clicked,
         coalesce(a.bounced,0) as bounced
  from series s
  left join agg a on a.day = s.ts
  order by 1;
$$;

-- Campaign summary view
create or replace view public.campaign_stats_view as
select c.id as campaign_id,
       c.name as campaign_name,
       c.user_id,
       sum((e.event_type='sent')::int)    as sent,
       sum((e.event_type='opened')::int)  as opened,
       sum((e.event_type='clicked')::int) as clicked,
       sum((e.event_type='bounced')::int) as bounced,
       case 
         when sum((e.event_type='sent')::int) > 0 
         then round((sum((e.event_type='opened')::int)::float / sum((e.event_type='sent')::int)) * 100, 1)
         else 0 
       end as open_rate,
       case 
         when sum((e.event_type='sent')::int) > 0 
         then round((sum((e.event_type='clicked')::int)::float / sum((e.event_type='sent')::int)) * 100, 1)
         else 0 
       end as click_rate
from campaigns c
left join email_events e on e.campaign_id = c.id
group by c.id, c.name, c.user_id;

-- Analytics totals view
create or replace view public.analytics_totals_view as
select user_id,
       sum(sent) as total_sent,
       sum(opened) as total_opened,
       sum(clicked) as total_clicked,
       sum(bounced) as total_bounced,
       case 
         when sum(sent) > 0 
         then round((sum(opened)::float / sum(sent)) * 100, 1)
         else 0 
       end as overall_open_rate,
       case 
         when sum(sent) > 0 
         then round((sum(clicked)::float / sum(sent)) * 100, 1)
         else 0 
       end as overall_click_rate
from campaign_stats_view
group by user_id;

-- Row Level Security (RLS) policies
alter table public.campaigns enable row level security;
alter table public.email_events enable row level security;

-- Campaigns policies
create policy "Users can view their own campaigns" on public.campaigns
  for select using (auth.uid() = user_id);

create policy "Users can insert their own campaigns" on public.campaigns
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own campaigns" on public.campaigns
  for update using (auth.uid() = user_id);

create policy "Users can delete their own campaigns" on public.campaigns
  for delete using (auth.uid() = user_id);

-- Email events policies
create policy "Users can view their own email events" on public.email_events
  for select using (auth.uid() = user_id);

create policy "Users can insert their own email events" on public.email_events
  for insert with check (auth.uid() = user_id);

-- Grant necessary permissions
grant usage on schema public to authenticated;
grant all on public.campaigns to authenticated;
grant all on public.email_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.email_event_buckets to authenticated;