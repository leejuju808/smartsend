-- Lead-level reply stamp and enqueue guard protections

-- A) Lead-level reply stamp (for fast checks)
alter table public.campaign_leads
  add column if not exists last_reply_at timestamptz;

-- keep last_reply_at in sync whenever a detection lands
create or replace function public.on_reply_detection_mark_lead()
returns trigger language plpgsql as $$
begin
  update public.campaign_leads
     set last_reply_at = coalesce(last_reply_at, new.created_at)
   where id = new.lead_id;
  return new;
end;
$$;

drop trigger if exists trg_on_reply_detection_mark_lead on public.reply_detections;
create trigger trg_on_reply_detection_mark_lead
after insert on public.reply_detections
for each row execute procedure public.on_reply_detection_mark_lead();

-- B) Expand delivery_events.event to include enqueue guards
do $$
begin
  if exists (
    select 1
      from information_schema.constraint_column_usage
     where table_name = 'delivery_events'
       and constraint_name like 'delivery_events_event_check%'
  ) then
    alter table public.delivery_events
      drop constraint if exists delivery_events_event_check;
  end if;
end$$;

alter table public.delivery_events
  add constraint delivery_events_event_check
  check (event in (
    'sent','delivered','opened','clicked','bounced',
    'reply_detected','ooo_detected','unsubscribe_detected','manual_pause',
    'enqueue_blocked'
  ));

-- C) Helper function for scheduler guard
create or replace function public.can_enqueue_followup(p_campaign uuid, p_lead uuid)
returns table(ok boolean, reason text)
language plpgsql
as $$
declare
  v_paused_until timestamptz;
  v_replied_at timestamptz;
begin
  select cl.paused_until, cl.last_reply_at
    into v_paused_until, v_replied_at
  from public.campaign_leads cl
  where cl.id = p_lead
    and cl.campaign_id = p_campaign;

  if not found then
    return query select false, 'lead_not_found';
    return;
  end if;

  if v_paused_until is not null and v_paused_until > now() then
    return query select false, 'paused_until';
    return;
  end if;

  if v_replied_at is not null then
    return query select false, 'has_reply';
    return;
  end if;

  return query select true, null::text;
end;
$$;

-- D) Safety trigger: block inserts to followup_tasks at DB level (optional but recommended)
create or replace function public.guard_followup_insert()
returns trigger language plpgsql
as $$
declare
  r record;
begin
  select *
    into r
  from public.can_enqueue_followup(new.campaign_id, new.lead_id)
  limit 1;

  if not r.ok then
    raise exception 'enqueue_blocked: %', r.reason using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_followup_insert on public.followup_tasks;
create trigger trg_guard_followup_insert
before insert on public.followup_tasks
for each row execute procedure public.guard_followup_insert();

-- E) Unique safety (avoid dupes while pending)
create index if not exists idx_followups_unique_pending
  on public.followup_tasks(campaign_id, step_id, lead_id)
  where sent_at is null and canceled_at is null;





