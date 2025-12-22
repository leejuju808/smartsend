-- Email Tracking System
-- Creates email_events and tracked_links tables, and adds denormalized tracking columns to emails_outbox

-- 1) Email events table
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outbox_id uuid not null references public.emails_outbox(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  type text not null check (type in ('delivered','opened','clicked')),
  meta jsonb default '{}'::jsonb,
  ip inet,
  ua text,
  created_at timestamptz default now()
);

create index if not exists email_events_by_outbox on public.email_events (outbox_id, type, created_at);
create index if not exists email_events_by_user on public.email_events (user_id, type, created_at);

-- 2) Trackable links (unique short codes)
create table if not exists public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outbox_id uuid not null references public.emails_outbox(id) on delete cascade,
  target_url text not null,
  short_code text unique not null, -- e.g. nanoid
  created_at timestamptz default now()
);

create index if not exists tracked_links_outbox_idx on public.tracked_links (outbox_id);

-- 3) Denormalized flags on outbox (fast reads)
alter table public.emails_outbox
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz;

-- RLS
alter table public.email_events enable row level security;
alter table public.tracked_links enable row level security;

create policy "owner read events" on public.email_events
for select to authenticated using (user_id = auth.uid());

create policy "owner read links" on public.tracked_links
for select to authenticated using (user_id = auth.uid());

-- Allow authenticated users to insert their own events and links (for tracking pixel and redirect endpoints)
create policy "owner write events" on public.email_events
for insert to authenticated with check (user_id = auth.uid());

create policy "owner write links" on public.tracked_links
for insert to authenticated with check (user_id = auth.uid());

-- Allow service role to insert events and links
create policy "service write events" on public.email_events
for all to service_role using (true) with check (true);

create policy "service write links" on public.tracked_links
for all to service_role using (true) with check (true);

-- Analytics RPC functions
create or replace function public.analytics_totals(p_user uuid)
returns json language sql as $$
  with s as (
    select count(*) as sent from public.emails_outbox where user_id = p_user and status = 'sent'
  ),
  o as (
    select count(distinct outbox_id) as opened from public.email_events where user_id = p_user and type = 'opened'
  ),
  c as (
    select count(distinct outbox_id) as clicked from public.email_events where user_id = p_user and type = 'clicked'
  )
  select json_build_object(
    'sent', (select sent from s),
    'opened', (select opened from o),
    'clicked', (select clicked from c)
  );
$$;

create or replace function public.analytics_series(p_user uuid, p_days int)
returns table(day date, sent int, opened int, clicked int)
language sql as $$
  with days as (
    select generate_series((now()::date - (p_days - 1)), now()::date, interval '1 day')::date as day
  ),
  s as (
    select sent_at::date as day, count(*) sent
    from public.emails_outbox where user_id = p_user and status = 'sent' and sent_at >= now() - (p_days || ' days')::interval
    group by 1
  ),
  o as (
    select created_at::date as day, count(distinct outbox_id) opened
    from public.email_events where user_id = p_user and type = 'opened' and created_at >= now() - (p_days || ' days')::interval
    group by 1
  ),
  c as (
    select created_at::date as day, count(distinct outbox_id) clicked
    from public.email_events where user_id = p_user and type = 'clicked' and created_at >= now() - (p_days || ' days')::interval
    group by 1
  )
  select d.day,
         coalesce(s.sent,0) sent,
         coalesce(o.opened,0) opened,
         coalesce(c.clicked,0) clicked
  from days d
  left join s on s.day = d.day
  left join o on o.day = d.day
  left join c on c.day = d.day
  order by d.day;
$$;

-- Grant execute permissions
grant execute on function public.analytics_totals(uuid) to authenticated;
grant execute on function public.analytics_series(uuid, int) to authenticated;

