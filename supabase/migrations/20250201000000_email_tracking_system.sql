-- Email Tracking System: Open/Click tracking with idempotent events

-- A) Send logs: add provider_message_id + tracking_token + body_html
alter table public.send_logs
  add column if not exists provider_message_id text,
  add column if not exists tracking_token text unique,
  add column if not exists body_html text;

create index if not exists idx_send_logs_campaign_lead on public.send_logs(campaign_id, lead_id);
create index if not exists idx_send_logs_tracking on public.send_logs(tracking_token);

-- B) Tracking events (open/click)
create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete set null,
  send_log_id uuid references public.send_logs(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  type text not null check (type in ('open','click')),
  url text,                    -- for clicks
  ua text,                     -- user agent
  ip inet,                     -- remote ip
  extra jsonb default '{}'::jsonb
);

create index if not exists idx_tracking_events_compound on public.tracking_events(campaign_id, lead_id, type, created_at desc);
create index if not exists idx_tracking_events_send_log on public.tracking_events(send_log_id);

-- C) RLS (read by campaign owner or share)
alter table public.tracking_events enable row level security;

drop policy if exists "tracking by owner/share" on public.tracking_events;
create policy "tracking by owner/share" on public.tracking_events
for select using (
  exists (
    select 1
    from public.campaigns c
    where c.id = tracking_events.campaign_id
      and (
        c.user_id = auth.uid()
        or exists (select 1 from public.campaign_shares s where s.campaign_id=c.id and s.user_id=auth.uid())
      )
  )
);

-- Service role can insert
drop policy if exists "tracking events insert service" on public.tracking_events;
create policy "tracking events insert service" on public.tracking_events
for insert to service_role using (true) with check (true);

-- D) First open/click rollups (views)
create or replace view public.v_send_first_events as
select
  sl.id as send_log_id,
  min(te.created_at) filter (where te.type='open')  as first_open_at,
  min(te.created_at) filter (where te.type='click') as first_click_at,
  count(*) filter (where te.type='open')  as opens,
  count(*) filter (where te.type='click') as clicks
from public.send_logs sl
left join public.tracking_events te on te.send_log_id = sl.id
group by sl.id;

-- E) Lead engagement summary (fast list use)
create or replace view public.v_lead_engagement as
select
  l.id as lead_id,
  l.email,
  count(sl.id)                                 as emails_sent,
  count(te.id) filter (where te.type='open')   as total_opens,
  count(te.id) filter (where te.type='click')  as total_clicks,
  max(te.created_at)                           as last_engaged_at
from public.leads l
left join public.send_logs sl on sl.lead_id = l.id
left join public.tracking_events te on te.send_log_id = sl.id
group by l.id, l.email;

