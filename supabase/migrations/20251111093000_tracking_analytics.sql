-- Email engagement tracking: links, events, aggregates, and helpers.
-- Run in Supabase SQL.

-- Clean up prior definitions so the script is idempotent.
drop materialized view if exists public.campaign_daily_stats;
drop view if exists public.message_stats;
drop function if exists public.safe_inc_click(uuid);
drop table if exists public.tracking_events cascade;
drop table if exists public.tracked_links cascade;

-- A) Link map (per queued message)
create table if not exists public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  queue_id uuid not null references public.send_queue(id) on delete cascade,
  idx int not null check (idx >= 0),
  original_url text not null,
  short_code text not null unique,
  clicks int not null default 0
);

create index if not exists idx_tracked_links_queue on public.tracked_links(queue_id);
create unique index if not exists uidx_tracked_links_queue_idx on public.tracked_links(queue_id, idx);

-- B) Open & click events
create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  queue_id uuid not null references public.send_queue(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  kind text not null check (kind in ('open','click')),
  link_id uuid references public.tracked_links(id) on delete set null,
  ua text,
  ip inet,
  referrer text
);

create index if not exists idx_tracking_events_queue_kind on public.tracking_events(queue_id, kind);
create index if not exists idx_tracking_events_account_created on public.tracking_events(account_id, created_at);

-- C) Message analytics view (quick aggregates)
create or replace view public.message_stats as
select
  q.id as queue_id,
  q.account_id,
  q.campaign_id,
  q.lead_id,
  count(*) filter (where te.kind = 'open') as opens,
  count(distinct case when te.kind = 'open' then te.id end) as open_events,
  count(*) filter (where te.kind = 'click') as clicks,
  coalesce(bool_or(te.kind = 'open'), false) as opened,
  coalesce(bool_or(te.kind = 'click'), false) as clicked
from public.send_queue q
left join public.tracking_events te on te.queue_id = q.id
group by 1,2,3,4;

alter view public.message_stats set (security_invoker = on);

-- D) Daily campaign rollup (materialized view)
create materialized view if not exists public.campaign_daily_stats as
select
  date_trunc('day', q.created_at) as day,
  q.account_id,
  q.campaign_id,
  count(*) as sent,
  count(*) filter (where ms.opened) as opened_msgs,
  count(*) filter (where ms.clicked) as clicked_msgs
from public.send_queue q
left join public.message_stats ms on ms.queue_id = q.id
where q.state = 'sent'
group by 1,2,3;

create unique index if not exists uidx_campaign_daily_stats on public.campaign_daily_stats(day, account_id, campaign_id);

-- Refresh daily stats every hour when pg_cron is available
select cron.schedule(
  'refresh-campaign-daily-stats',
  '15 * * * *',
  $$refresh materialized view concurrently public.campaign_daily_stats;$$
) where exists (select 1 from pg_extension where extname = 'pg_cron');

-- E) Helper RPC to increment safely
create or replace function public.safe_inc_click(p_link_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tracked_links
     set clicks = clicks + 1
   where id = p_link_id;
$$;

grant execute on function public.safe_inc_click(uuid) to anonymous;

-- F) Row level security aligned with account-based access
alter table public.tracked_links enable row level security;
alter table public.tracking_events enable row level security;

drop policy if exists tracked_links_select on public.tracked_links;
create policy tracked_links_select on public.tracked_links
  for select
  using ( public.is_account_member(auth.uid(), account_id) );

drop policy if exists tracked_links_manage on public.tracked_links;
create policy tracked_links_manage on public.tracked_links
  for all
  using ( public.is_account_member(auth.uid(), account_id) )
  with check (
    coalesce(
      (select tm.role::text
         from public.team_members tm
        where tm.account_id = tracked_links.account_id
          and tm.user_id = auth.uid()),
      ''
    ) in ('owner','admin','editor')
  );

drop policy if exists tracking_events_select on public.tracking_events;
create policy tracking_events_select on public.tracking_events
  for select
  using ( public.is_account_member(auth.uid(), account_id) );

drop policy if exists tracking_events_manage on public.tracking_events;
create policy tracking_events_manage on public.tracking_events
  for all
  using ( public.is_account_member(auth.uid(), account_id) )
  with check (
    coalesce(
      (select tm.role::text
         from public.team_members tm
        where tm.account_id = tracking_events.account_id
          and tm.user_id = auth.uid()),
      ''
    ) in ('owner','admin','editor')
  );

