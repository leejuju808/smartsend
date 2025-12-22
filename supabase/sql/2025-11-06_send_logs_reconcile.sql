-- Send log lifecycle hardening and reconciliation helpers
-- Run in Supabase SQL or include in a migration. All statements are idempotent.

-- A) Harden send_logs lifecycle fields (safe-add)
alter table public.send_logs
  add column if not exists status text
    check (status in ('pending','sent','delivered','bounced','complained','unsubscribed','failed')) default null,
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists replied_at timestamptz;

-- Helpful lookups
create index if not exists idx_logs_thread_created on public.send_logs(thread_id, created_at desc);
create index if not exists idx_logs_campaign_created on public.send_logs(campaign_id, created_at desc);
create index if not exists idx_logs_status on public.send_logs(status);

-- B) Reconcile: mark latest outbound in a thread as bounced/complained/unsubscribed on inbound labels
create or replace function public.reconcile_last_send_for_thread(
  p_thread uuid,
  p_effect text,                 -- 'bounce' | 'complaint' | 'unsubscribe' | 'reply'
  p_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_status text;
begin
  if p_effect not in ('bounce','complaint','unsubscribe','reply') then
    raise exception 'invalid effect';
  end if;

  -- latest outbound attempt in this thread
  select id into v_log_id
  from public.send_logs
  where thread_id = p_thread
  order by created_at desc
  limit 1;

  if v_log_id is null then
    return null;
  end if;

  if p_effect = 'bounce' then
    update public.send_logs
      set status = 'bounced',
          bounced_at = coalesce(bounced_at, p_at),
          updated_at = now()
    where id = v_log_id
    returning status into v_status;

  elsif p_effect = 'complaint' then
    update public.send_logs
      set status = 'complained',
          complained_at = coalesce(complained_at, p_at),
          updated_at = now()
    where id = v_log_id
    returning status into v_status;

  elsif p_effect = 'unsubscribe' then
    update public.send_logs
      set status = 'unsubscribed',
          unsubscribed_at = coalesce(unsubscribed_at, p_at),
          updated_at = now()
    where id = v_log_id
    returning status into v_status;

  elsif p_effect = 'reply' then
    update public.send_logs
      set replied_at = coalesce(replied_at, p_at),
          updated_at = now()
    where id = v_log_id
    returning status into v_status;
  end if;

  return v_log_id;
end;
$$;

-- C) Trigger: when inbound bounce/complaint/unsubscribe lands, reconcile send_logs
-- Assumes your classifier / routes set inbox_messages.ai_label in {'bounce','complaint','unsubscribe','reply'}
create or replace function public.trg_reconcile_on_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effect text;
  v_thread uuid;
begin
  -- only inbound messages
  if coalesce(new.direction,'in') <> 'in' then
    return new;
  end if;

  v_thread := new.thread_id;

  if new.ai_label = 'bounce' then
    perform public.reconcile_last_send_for_thread(v_thread, 'bounce', coalesce(new.created_at, now()));

  elsif new.ai_label = 'complaint' then
    perform public.reconcile_last_send_for_thread(v_thread, 'complaint', coalesce(new.created_at, now()));

  elsif new.ai_label = 'unsubscribe' then
    perform public.reconcile_last_send_for_thread(v_thread, 'unsubscribe', coalesce(new.created_at, now()));

  elsif new.ai_label = 'positive' or new.ai_label = 'reply' then
    perform public.reconcile_last_send_for_thread(v_thread, 'reply', coalesce(new.created_at, now()));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reconcile_on_inbound on public.inbox_messages;
create trigger trg_reconcile_on_inbound
after insert or update of ai_label on public.inbox_messages
for each row execute function public.trg_reconcile_on_inbound();

-- D) (Optional) If an unsubscribe row is written, also mark last send for that (campaign,lead)
create or replace function public.trg_reconcile_on_unsub()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
begin
  -- latest thread for this (campaign,lead)
  select t.id into v_thread
  from public.inbox_threads t
  where t.campaign_id = new.campaign_id
    and (t.lead_id = new.lead_id or new.lead_id is null)
  order by t.updated_at desc nulls last
  limit 1;

  if v_thread is not null then
    perform public.reconcile_last_send_for_thread(v_thread, 'unsubscribe', coalesce(new.created_at, now()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reconcile_on_unsub on public.campaign_unsubscribes;
create trigger trg_reconcile_on_unsub
after insert on public.campaign_unsubscribes
for each row execute function public.trg_reconcile_on_unsub();

-- 2) Views — campaign delivery stats + daily trend (idempotent)

-- A) Per-campaign rollup
create or replace view public.v_campaign_delivery_stats as
with base as (
  select
    sl.campaign_id,
    count(*) filter (where sl.status is null or sl.status in ('pending','sent','delivered','failed')) as attempts,
    count(*) filter (where sl.status = 'delivered') as delivered,
    count(*) filter (where sl.status = 'bounced')   as bounced,
    count(*) filter (where sl.status = 'complained') as complained,
    count(*) filter (where sl.status = 'unsubscribed') as unsubscribed,
    count(*) filter (where sl.replied_at is not null) as replied,
    count(*) filter (where sl.opened_at  is not null) as opened,
    count(*) filter (where sl.clicked_at is not null) as clicked
  from public.send_logs sl
  group by sl.campaign_id
)
select
  b.campaign_id,
  b.attempts,
  b.delivered,
  b.bounced,
  b.complained,
  b.unsubscribed,
  b.replied,
  b.opened,
  b.clicked,
  round(100.0 * nullif(b.replied,0)   / nullif(b.attempts,0), 2) as reply_rate_pct,
  round(100.0 * nullif(b.opened,0)    / nullif(b.attempts,0), 2) as open_rate_pct,
  round(100.0 * nullif(b.clicked,0)   / nullif(b.attempts,0), 2) as click_rate_pct,
  round(100.0 * nullif(b.bounced,0)   / nullif(b.attempts,0), 2) as bounce_rate_pct,
  round(100.0 * nullif(b.complained,0)/ nullif(b.attempts,0), 2) as complaint_rate_pct,
  round(100.0 * nullif(b.unsubscribed,0)/nullif(b.attempts,0), 2) as unsub_rate_pct
from base b;

-- B) 30-day daily trend per campaign
create or replace view public.v_campaign_daily_delivery as
select
  sl.campaign_id,
  date_trunc('day', coalesce(sl.delivered_at, sl.created_at))::date as day,
  count(*)                                                    as attempts,
  count(*) filter (where sl.status = 'delivered')             as delivered,
  count(*) filter (where sl.status = 'bounced')               as bounced,
  count(*) filter (where sl.status = 'complained')            as complained,
  count(*) filter (where sl.status = 'unsubscribed')          as unsubscribed,
  count(*) filter (where sl.replied_at is not null)           as replied,
  count(*) filter (where sl.opened_at is not null)            as opened,
  count(*) filter (where sl.clicked_at is not null)           as clicked
from public.send_logs sl
where coalesce(sl.delivered_at, sl.created_at) >= now() - interval '30 days'
group by 1,2
order by 1,2;

-- C) Account-level sending health (rolling 14 days)
create or replace view public.v_account_sending_health as
select
  sl.account_id,
  count(*) filter (where sl.created_at >= now() - interval '14 days') as sends_14d,
  round(100.0 * count(*) filter (where sl.bounced_at is not null and sl.created_at >= now() - interval '14 days')
        / nullif(count(*) filter (where sl.created_at >= now() - interval '14 days'),0), 2) as bounce_rate_14d,
  round(100.0 * count(*) filter (where sl.complained_at is not null and sl.created_at >= now() - interval '14 days')
        / nullif(count(*) filter (where sl.created_at >= now() - interval '14 days'),0), 2) as complaint_rate_14d
from public.send_logs sl
group by 1;

-- 3) Optional provider-MID match (apply within your provider ingest when available)
-- Example TypeScript snippet for clarity:
-- await admin
--   .from('send_logs')
--   .update({ status: 'bounced', bounced_at: new Date().toISOString() })
--   .match({ provider: 'gmail', provider_message_id: outboundMid });

-- 5) Smoke tests (run manually as needed)
-- select public.reconcile_last_send_for_thread('<THREAD_ID>', 'bounce', now());
-- select id, status, bounced_at from public.send_logs where thread_id = '<THREAD_ID>' order by created_at desc limit 1;
-- select * from public.v_campaign_delivery_stats where campaign_id = '<CID>';
-- select * from public.v_campaign_daily_delivery where campaign_id = '<CID>' order by day;












