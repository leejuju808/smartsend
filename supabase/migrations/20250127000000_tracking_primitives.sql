-- Tracking Primitives Migration
-- A) Lead-level unsubscribe flag

alter table public.leads
  add column if not exists unsubscribed boolean default false,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists unsubscribe_reason text;

create index if not exists idx_leads_unsub on public.leads(unsubscribed);

-- B) Tracking links (one token per (campaign, lead, step, url))
create table if not exists public.tracking_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,                        -- short id in redirect
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  step_no int not null,
  dest_url text not null
);

create index if not exists idx_tl_composite on public.tracking_links(campaign_id, lead_id, step_no);

-- C) Delivery events (open/click/unsubscribe)
-- (If you already created this earlier, just ensure columns match)
create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('open','click','unsubscribe','bounce','spam','reply')),
  campaign_id uuid references public.campaigns(id) on delete set null,
  account_id uuid references public.connected_accounts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  step_no int,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_de_type_time on public.delivery_events(event_type, created_at);
create index if not exists idx_de_campaign on public.delivery_events(campaign_id);
create index if not exists idx_de_lead on public.delivery_events(lead_id);

-- D) Metrics views (unique opens/clicks)
create or replace view public.v_campaign_metrics as
select
  c.id as campaign_id,
  count(*) filter (where de.event_type='open')                       as opens_total,
  count(distinct de.lead_id) filter (where de.event_type='open')     as opens_unique,
  count(*) filter (where de.event_type='click')                      as clicks_total,
  count(distinct de.lead_id) filter (where de.event_type='click')    as clicks_unique,
  count(distinct de.lead_id) filter (where de.event_type='unsubscribe') as unsub_unique
from public.campaigns c
left join public.delivery_events de on de.campaign_id = c.id
group by 1;

create or replace view public.v_step_metrics as
select
  campaign_id, step_no,
  count(*) filter (where event_type='open') as opens_total,
  count(distinct lead_id) filter (where event_type='open') as opens_unique,
  count(*) filter (where event_type='click') as clicks_total,
  count(distinct lead_id) filter (where event_type='click') as clicks_unique
from public.delivery_events
group by 1,2;

-- E) Function to cancel future queue items for a lead
create or replace function public.cancel_future_queue_for_lead(p_lead uuid)
returns void
language plpgsql as $$
begin
  update public.send_queue
  set status = 'canceled',
      last_error = 'unsubscribed'
  where lead_id = p_lead
    and status in ('queued', 'pending');
end;
$$;

