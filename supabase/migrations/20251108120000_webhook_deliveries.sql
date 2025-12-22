-- A) Delivery status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'webhook_delivery_status') then
    create type public.webhook_delivery_status as enum ('queued','success','failed','permanent_fail','skipped');
  end if;
end$$;

-- B) Deliveries table (append-only attempts)
create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  webhook_id uuid not null references public.campaign_webhooks(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_id uuid not null references public.campaign_events(id) on delete cascade,
  attempt int not null default 1,
  status public.webhook_delivery_status not null default 'queued',
  next_attempt_at timestamptz,
  response_status int,
  response_ms int,
  error text,
  request_body jsonb not null default '{}'::jsonb
);

create index if not exists idx_wd_webhook on public.webhook_deliveries(webhook_id, created_at desc);
create index if not exists idx_wd_event on public.webhook_deliveries(event_id);
create index if not exists idx_wd_retry on public.webhook_deliveries(status, next_attempt_at);

-- C) RLS (read for viewers; no direct writes)
alter table public.webhook_deliveries enable row level security;

drop policy if exists "wd_read" on public.webhook_deliveries;
create policy "wd_read" on public.webhook_deliveries
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));

-- D) Backoff helper (1, 5, 15, 60, 180 min… tweak as you like)
create or replace function public.backoff_minutes(p_attempt int)
returns int language sql immutable as $$
  select case
    when p_attempt <= 1 then 1
    when p_attempt = 2 then 5
    when p_attempt = 3 then 15
    when p_attempt = 4 then 60
    when p_attempt = 5 then 180
    else 720 -- 12h for any later attempt
  end
$$;

-- E) Upsert/queue helper (called by API after we decide which hooks fire)
create or replace function public.queue_webhook_deliveries(
  p_campaign uuid,
  p_event uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare cnt int := 0;
begin
  insert into public.webhook_deliveries (webhook_id, campaign_id, event_id, attempt, status, next_attempt_at)
  select w.id, w.campaign_id, p_event, 1, 'queued', now()
  from public.campaign_webhooks w
  join public.campaign_events e on e.id = p_event and e.campaign_id = w.campaign_id
  where w.enabled and (e.type = any(w.event_types));

  get diagnostics cnt = row_count;
  return cnt;
end;
$$;

-- F) Snapshot view for a webhook (optional convenience)
create or replace view public.v_webhook_health as
select
  w.id as webhook_id,
  w.campaign_id,
  w.name,
  count(*) filter (where d.status in ('queued','failed')) as pending,
  count(*) filter (where d.status = 'success') as successes,
  count(*) filter (where d.status in ('failed','permanent_fail')) as failures,
  max(d.created_at) as last_attempt
from public.campaign_webhooks w
left join public.webhook_deliveries d on d.webhook_id = w.id
group by w.id, w.campaign_id, w.name;

