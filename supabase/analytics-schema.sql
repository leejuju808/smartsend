-- SmartSend Analytics Dashboard - Database Schema
-- Run this in your Supabase SQL editor to set up the analytics tables

-- Basic tables
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.email_events (
  id bigserial primary key,
  email_id uuid,
  campaign_id uuid references campaigns(id) on delete set null,
  event_type text check (event_type in ('sent','opened','clicked','bounced')) not null,
  created_at timestamptz not null default now(),
  recipient text,
  subject text,
  clicked_url text,
  clicked_domain text,
  clicked_path text
);

-- Suppression list for deliverability safeguards
create table if not exists public.suppression_list (
  recipient text primary key,
  reason text not null check (reason in ('bounce','manual','complaint','unsubscribe','other')),
  source text,
  domain text,
  created_at timestamptz not null default now()
);

-- Indexes for fast analytics queries
create index if not exists idx_email_events_created_at on public.email_events(created_at desc);
create index if not exists idx_email_events_recipient on public.email_events(recipient);
create index if not exists idx_email_events_campaign on public.email_events(campaign_id);
create index if not exists idx_email_events_event_type on public.email_events(event_type);
create index if not exists idx_email_events_clicked_domain on public.email_events(clicked_domain);
create index if not exists idx_email_events_clicked_path on public.email_events(clicked_path);
create index if not exists idx_supp_domain on public.suppression_list(domain);

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
       sum((e.event_type='sent')::int)    as sent,
       sum((e.event_type='opened')::int)  as opened,
       sum((e.event_type='clicked')::int) as clicked
from campaigns c
left join email_events e on e.campaign_id = c.id
group by 1,2;

-- Sample data for testing (optional)
insert into public.campaigns (id, name) values 
  ('cmp_warm1', 'Warmup A'),
  ('cmp_demo2', 'Demo Requests'),
  ('cmp_cold3', 'Cold - SMB')
on conflict (id) do nothing;

-- Sample email events for testing (optional)
insert into public.email_events (campaign_id, event_type, recipient, subject, created_at) values
  ('cmp_warm1', 'sent', 'ceo@acme.com', 'Quick question about your growth', now() - interval '1 day'),
  ('cmp_warm1', 'opened', 'ceo@acme.com', 'Quick question about your growth', now() - interval '23 hours'),
  ('cmp_warm1', 'clicked', 'ceo@acme.com', 'Quick question about your growth', now() - interval '22 hours'),
  ('cmp_demo2', 'sent', 'founder@startup.io', 'Demo request follow-up', now() - interval '2 days'),
  ('cmp_demo2', 'opened', 'founder@startup.io', 'Demo request follow-up', now() - interval '1 day 20 hours'),
  ('cmp_cold3', 'sent', 'sales@company.com', 'Cold outreach - partnership', now() - interval '3 days'),
  ('cmp_cold3', 'bounced', 'invalid@company.com', 'Cold outreach - partnership', now() - interval '3 days')
on conflict do nothing;