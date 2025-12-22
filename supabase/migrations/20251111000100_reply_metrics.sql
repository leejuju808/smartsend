-- Add thread reply metadata columns and related index
alter table public.inbox_threads
  add column if not exists replied_at timestamptz,
  add column if not exists last_reply_intent text check (last_reply_intent in ('ooo','unsubscribe','positive','negative','question','routing','neutral','unknown')),
  add column if not exists last_reply_confidence real,
  add column if not exists last_classifier text;

create index if not exists idx_threads_replied on public.inbox_threads(replied_at);

-- Helper to resume a lead immediately
create or replace function public.resume_lead_now(p_lead uuid)
returns void
language plpgsql
as $$
begin
  update public.campaign_leads
     set paused_until = null,
         paused_reason = null
   where id = p_lead;

  -- Optional: reopen all threads for ordering
  update public.inbox_threads
     set updated_at = now()
   where lead_id = p_lead;
end;
$$;

-- Trigger to mark threads when a reply detection is inserted
create or replace function public.on_reply_detection_mark_thread()
returns trigger
language plpgsql
as $$
begin
  if (new.thread_id is not null) then
    update public.inbox_threads
       set replied_at = coalesce(replied_at, now()),
           last_reply_intent = new.intent,
           last_reply_confidence = new.confidence,
           last_classifier = new.classifier,
           updated_at = now()
     where id = new.thread_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_on_reply_detection_mark_thread on public.reply_detections;
create trigger trg_on_reply_detection_mark_thread
after insert on public.reply_detections
for each row execute procedure public.on_reply_detection_mark_thread();

-- Lightweight daily metrics aggregate
create table if not exists public.metrics_daily (
  day date primary key,
  replies int not null default 0,
  ooo int not null default 0,
  unsub int not null default 0,
  sent int not null default 0
);

-- Increment metrics when delivery events are inserted
create or replace function public.bump_metrics_from_event()
returns trigger
language plpgsql
as $$
declare
  d date := (new.created_at at time zone 'utc')::date;
begin
  insert into public.metrics_daily(day)
       values (d)
  on conflict (day) do nothing;

  if new.event = 'sent' then
    update public.metrics_daily set sent = sent + 1 where day = d;
  elsif new.event = 'ooo_detected' then
    update public.metrics_daily set ooo = ooo + 1 where day = d;
  elsif new.event = 'unsubscribe_detected' then
    update public.metrics_daily set unsub = unsub + 1 where day = d;
  elsif new.event = 'reply_detected' then
    update public.metrics_daily set replies = replies + 1 where day = d;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bump_metrics_from_event on public.delivery_events;
create trigger trg_bump_metrics_from_event
after insert on public.delivery_events
for each row execute procedure public.bump_metrics_from_event();





