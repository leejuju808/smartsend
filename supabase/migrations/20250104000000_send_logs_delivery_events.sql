-- A) Core send logs (one row per outbound attempt)

create table if not exists public.send_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  queue_id uuid references public.send_queue(id) on delete set null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete set null,
  thread_id uuid, -- references inbox_threads or other thread tables (flexible, no FK to allow different schemas)
  lead_id uuid not null references public.leads(id) on delete cascade,

  step_no int,
  to_email citext not null,
  subject text,
  body_preview text,                 -- optional: first 200 chars, no PII heavy
  provider text,                     -- e.g., "resend", "gmail", "smtp"
  provider_message_id text,          -- set after provider accept
  status text not null check (status in ('queued','sending','sent','failed')) default 'queued',
  error text,

  sent_at timestamptz                 -- when provider accepted
);

create index if not exists idx_send_logs_campaign_day on public.send_logs(campaign_id, sent_at);
create index if not exists idx_send_logs_lead on public.send_logs(lead_id);
create index if not exists idx_send_logs_provider_id on public.send_logs(provider_message_id);
create index if not exists idx_send_logs_queue on public.send_logs(queue_id);

-- Trigger to update updated_at
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_send_logs_updated_at on public.send_logs;
create trigger trg_send_logs_updated_at before update on public.send_logs
  for each row execute function public.update_updated_at_column();

-- B) Delivery/engagement events (normalized)

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  log_id uuid references public.send_logs(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,

  kind text not null check (kind in ('delivered','open','click','bounce','spam','unsubscribe')),
  provider text,
  provider_message_id text,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_delivery_events_campaign_day on public.delivery_events(campaign_id, created_at);
create index if not exists idx_delivery_events_log on public.delivery_events(log_id);
create index if not exists idx_delivery_events_kind on public.delivery_events(kind);
create index if not exists idx_delivery_events_provider_msg on public.delivery_events(provider_message_id);

-- C) Helper view: last known status per log

create or replace view public.v_send_status as
select
  l.id as log_id,
  l.campaign_id,
  l.lead_id,
  l.sent_at,
  coalesce(
    (select 'bounce' from public.delivery_events e where e.log_id = l.id and e.kind='bounce' limit 1),
    (select 'spam' from public.delivery_events e where e.log_id = l.id and e.kind='spam' limit 1),
    (select 'delivered' from public.delivery_events e where e.log_id = l.id and e.kind='delivered' limit 1),
    l.status
  ) as last_status,
  (exists (select 1 from public.delivery_events e where e.log_id=l.id and e.kind='open'))  as has_open,
  (exists (select 1 from public.delivery_events e where e.log_id=l.id and e.kind='click')) as has_click
from public.send_logs l;

-- D) Campaign rollups (7/14/30d)

create or replace view public.v_outbound_rollup as
with base as (
  select
    date_trunc('day', coalesce(sent_at, created_at))::date as day,
    campaign_id,
    count(*) filter (where status='sent')::int as sent,
    count(*) filter (where status='failed')::int as failed
  from public.send_logs
  group by 1,2
),
del as (
  select date_trunc('day', created_at)::date as day, campaign_id,
         count(*) filter (where kind='delivered')::int as delivered,
         count(*) filter (where kind='open')::int      as opens,
         count(*) filter (where kind='click')::int     as clicks,
         count(*) filter (where kind='bounce')::int    as bounces,
         count(*) filter (where kind='spam')::int      as spams,
         count(*) filter (where kind='unsubscribe')::int as unsubscribes
  from public.delivery_events
  group by 1,2
)
select
  coalesce(b.day, d.day) as day,
  coalesce(b.campaign_id, d.campaign_id) as campaign_id,
  coalesce(b.sent,0)        as sent,
  coalesce(b.failed,0)      as failed,
  coalesce(d.delivered,0)   as delivered,
  coalesce(d.opens,0)       as opens,
  coalesce(d.clicks,0)      as clicks,
  coalesce(d.bounces,0)     as bounces,
  coalesce(d.spams,0)       as spams,
  coalesce(d.unsubscribes,0)as unsubscribes
from base b
full join del d on d.day=b.day and d.campaign_id=b.campaign_id;

-- E) Minimal RLS (adjust to your tenant model)

alter table public.send_logs enable row level security;
alter table public.delivery_events enable row level security;

drop policy if exists sel_logs on public.send_logs;
create policy sel_logs on public.send_logs for select to authenticated using (true);

drop policy if exists ins_logs_srv on public.send_logs;
create policy ins_logs_srv on public.send_logs for insert to service_role using (true) with check (true);

drop policy if exists upd_logs_srv on public.send_logs;
create policy upd_logs_srv on public.send_logs for update to service_role using (true) with check (true);

drop policy if exists sel_events on public.delivery_events;
create policy sel_events on public.delivery_events for select to authenticated using (true);

drop policy if exists ins_events_srv on public.delivery_events;
create policy ins_events_srv on public.delivery_events for insert to service_role using (true) with check (true);

-- =====================================================
-- Reply Labeler: Fast Paths + Label-Changed Side-Effects
-- =====================================================

-- A) Help the labeler query fast
create index if not exists idx_inbox_inbound_unlabeled
  on public.inbox_messages(created_at)
  where direction in ('inbound', 'in') and ai_label is null;

create index if not exists idx_inbox_inbound_labeled
  on public.inbox_messages(ai_label)
  where direction in ('inbound', 'in') and ai_label is not null;

-- B) Reuse your human/non-human rule
create or replace function public.is_human_reply(p_ai_label text)
returns boolean
language sql immutable as $$
  select case
    when p_ai_label is null then true
    when lower(p_ai_label) in ('ooo','bounce','unsubscribe') then false
    else true
  end
$$;

-- C) Common side-effect worker so we can call it on insert OR on label updates
create or replace function public.apply_reply_sidefx(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  m record;
begin
  select id, thread_id, lead_id, direction, ai_label, created_at
    into m
  from public.inbox_messages
  where id = p_message_id;

  if m.id is null then
    return;
  end if;

  -- only inbound can stop sequences
  if coalesce(lower(m.direction),'') not in ('inbound', 'in') then
    return;
  end if;

  -- non-human? do nothing
  if not public.is_human_reply(m.ai_label) then
    return;
  end if;

  -- mark thread replied & cancel follow-ups
  update public.inbox_threads t
     set replied_at = coalesce(t.replied_at, m.created_at),
         stopped_by_reply = true,
         updated_at = now()
   where t.id = m.thread_id;

  if m.thread_id is not null then
    perform public.cancel_future_queue_for_thread(m.thread_id);
  end if;
end$$;

-- D) Fire side-effects when a new inbound row lands (insert)
drop trigger if exists tg_inbound_reply_sidefx on public.inbox_messages;
create trigger tg_inbound_reply_sidefx
after insert on public.inbox_messages
for each row
when (new.direction in ('inbound', 'in') and public.is_human_reply(new.ai_label))
execute function public.apply_reply_sidefx(new.id);

-- E) ALSO fire when the label changes from null/auto to human (update)
create or replace function public.tg_inbound_label_changed()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(lower(new.direction),'') not in ('inbound', 'in') then
    return new;
  end if;

  -- only act when label transitions to human
  if not public.is_human_reply(old.ai_label) and public.is_human_reply(new.ai_label) then
    perform public.apply_reply_sidefx(new.id);
  end if;

  return new;
end$$;

drop trigger if exists tg_inbound_label_changed on public.inbox_messages;
create trigger tg_inbound_label_changed
after update of ai_label on public.inbox_messages
for each row execute function public.tg_inbound_label_changed();
