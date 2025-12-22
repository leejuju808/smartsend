-- Auto-pause threads on human reply and expose manual controls

set check_function_bodies = off;

-- A) Thread state columns
alter table public.inbox_threads
  add column if not exists state text not null default 'open'
    check (state in ('open','auto_paused','closed')),
  add column if not exists last_reply_at timestamptz;

-- Ensure campaign_leads status enum includes replied
alter table public.campaign_leads
  add column if not exists status text not null default 'new'
    check (status in ('new','queued','sent','replied','unsub','bounced','paused'));

-- B) Helper: auto-pause thread operation
create or replace function public.auto_pause_thread(p_thread uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_campaign uuid;
  v_lead uuid;
  v_has_sendq boolean := false;
begin
  select campaign_id, lead_id
    into v_campaign, v_lead
  from public.inbox_threads
  where id = p_thread;

  if v_campaign is null then
    return;
  end if;

  -- lock down future sends if send_queue exists
  select true
    into v_has_sendq
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'send_queue';

  if coalesce(v_has_sendq, false) then
    update public.send_queue
      set canceled = true
    where thread_id = p_thread
      and coalesce(canceled, false) = false
      and coalesce(scheduled_at, now()) > now();
  end if;

  -- halt outbox jobs that are queued but not sending yet
  update public.outbox_requests
    set status = 'failed',
        last_error = 'auto_paused_by_reply'
  where thread_id = p_thread
    and status = 'queued';

  -- mark thread visibly
  update public.inbox_threads
    set state = 'auto_paused',
        needs_reply = false
  where id = p_thread;

  -- mark campaign lead as replied
  update public.campaign_leads
    set status = 'replied'
  where campaign_id = v_campaign
    and lead_id = v_lead;

  -- close any active follow-up tasks (queued/drafted) to avoid duplicate nudges
  update public.followup_tasks
    set status = 'skipped',
        last_error = 'auto_paused_by_reply'
  where thread_id = p_thread
    and status in ('queued','drafted');
end;
$$;

-- C) Trigger helpers
create or replace function public._is_human_reply_label(lbl text)
returns boolean
language sql
immutable
as $$
  select coalesce(lbl, '') in ('human_reply','question','positive','neutral','routing');
$$;

create or replace function public.on_inbound_mark_replied()
returns trigger
language plpgsql
as $$
begin
  if new.direction = 'inbound'
     and public._is_human_reply_label(new.ai_label) then
    update public.inbox_threads
      set last_reply_at = coalesce(new.sent_at, now())
    where id = new.linked_thread_id;

    perform public.auto_pause_thread(new.linked_thread_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nm_inbound_replied on public.normalized_messages;
create trigger trg_nm_inbound_replied
  after insert on public.normalized_messages
  for each row
  execute function public.on_inbound_mark_replied();

-- D) Convenience RPCs
create or replace function public.mark_thread_as_replied(p_thread uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_campaign uuid;
begin
  select campaign_id
    into v_campaign
  from public.inbox_threads
  where id = p_thread;

  if v_campaign is null or not public.is_campaign_editor(v_campaign) then
    return false;
  end if;

  update public.inbox_threads
    set last_reply_at = now()
  where id = p_thread;

  perform public.auto_pause_thread(p_thread);
  return true;
end;
$$;

create or replace function public.unpause_thread(p_thread uuid, p_resume boolean default true)
returns boolean
language plpgsql
security definer
as $$
declare
  v_campaign uuid;
begin
  select campaign_id
    into v_campaign
  from public.inbox_threads
  where id = p_thread;

  if v_campaign is null or not public.is_campaign_editor(v_campaign) then
    return false;
  end if;

  update public.inbox_threads
    set state = 'open'
  where id = p_thread;

  if coalesce(p_resume, true) then
    perform public.resume_thread_sequence(p_thread);
  end if;

  return true;
end;
$$;

grant execute on function public.auto_pause_thread(uuid) to authenticated, service_role;
grant execute on function public.mark_thread_as_replied(uuid) to authenticated, service_role;
grant execute on function public.unpause_thread(uuid, boolean) to authenticated, service_role;




