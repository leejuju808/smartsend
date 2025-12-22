-- Reply Detection + Cancel Pending Follow-ups
-- Detects when prospects reply and automatically cancels future scheduled sends

-- A) Thread-level reply tracking
alter table public.inbox_threads
  add column if not exists replied_at timestamptz,
  add column if not exists stopped_by_reply boolean default false;

create index if not exists idx_threads_replied_at on public.inbox_threads(replied_at);

-- B) Campaign-level stop_on_reply toggle (default true)
alter table public.campaigns
  add column if not exists stop_on_reply boolean default true;

-- C) Extend audit_logs to support thread_id and auto actions
alter table public.audit_logs
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null;

-- Extend action constraint to include auto actions
alter table public.audit_logs
  drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check check (action in (
    'share.add', 'share.update', 'share.remove',
    'invite.create', 'invite.accept', 'invite.expire',
    'auto.cancel_followups'
  ));

create index if not exists idx_audit_logs_thread on public.audit_logs(thread_id);

-- D) Helper: cancel pending future queue items for this thread/lead
create or replace function public.cancel_future_queue_for_thread(p_thread uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_lead uuid;
  v_count int := 0;
begin
  select t.campaign_id, t.lead_id
    into v_campaign, v_lead
  from public.inbox_threads t
  where t.id = p_thread;

  if v_campaign is null or v_lead is null then
    return 0;
  end if;

  update public.send_queue
     set status = 'canceled', 
         updated_at = now(), 
         error = coalesce(error,'') || ' [auto-cancel: reply]'
   where campaign_id = v_campaign
     and lead_id = v_lead
     and status in ('pending', 'queued', 'scheduled')
     and scheduled_at > now();

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- E) Trigger: when an inbound message lands, mark replied + cancel follow-ups
create or replace function public.tg_on_inbound_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canceled int;
  v_campaign_id uuid;
  v_thread_id uuid;
  v_stop_on_reply boolean;
begin
  -- Only act on inbound human messages
  if new.direction = 'in' then
    v_thread_id := new.thread_id;
    
    -- Get campaign_id and check stop_on_reply setting
    select t.campaign_id, coalesce(c.stop_on_reply, true)
      into v_campaign_id, v_stop_on_reply
    from public.inbox_threads t
    left join public.campaigns c on c.id = t.campaign_id
    where t.id = v_thread_id;
    
    -- Only stop if campaign wants it (default true)
    if v_stop_on_reply then
      -- mark thread as replied if first time
      update public.inbox_threads
         set replied_at = coalesce(replied_at, new.sent_at),
             stopped_by_reply = true
       where id = v_thread_id
         and replied_at is null;

      -- cancel any pending future sends for this lead in this campaign
      v_canceled := public.cancel_future_queue_for_thread(v_thread_id);

      -- audit log
      if v_campaign_id is not null then
        insert into public.audit_logs(campaign_id, thread_id, action, meta)
        values (
          v_campaign_id,
          v_thread_id,
          'auto.cancel_followups',
          jsonb_build_object('canceled', v_canceled)
        );
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists tr_on_inbound_reply on public.inbox_messages;
create trigger tr_on_inbound_reply
after insert on public.inbox_messages
for each row execute function public.tg_on_inbound_reply();





