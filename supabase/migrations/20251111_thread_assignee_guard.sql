-- Thread assignee guard and delivery event updates

-- Ensure column + index (idempotent)
alter table public.inbox_threads
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create index if not exists idx_threads_assigned on public.inbox_threads(assigned_to);

-- Guard: assigned_to must be a member of the same campaign
create or replace function public.guard_thread_assignee()
returns trigger
language plpgsql
as $$
declare
  v_campaign uuid;
begin
  -- infer campaign from lead/thread relationship
  select cl.campaign_id
    into v_campaign
  from public.campaign_leads cl
  where cl.id = new.lead_id;

  if new.assigned_to is null then
    return new;
  end if;

  if v_campaign is null then
    raise exception 'assignee_campaign_not_found';
  end if;

  if not public.is_campaign_member(v_campaign, new.assigned_to, array['viewer','editor','owner']) then
    raise exception 'assignee_not_member';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_thread_assignee_ins on public.inbox_threads;
create trigger trg_guard_thread_assignee_ins
before insert on public.inbox_threads
for each row execute procedure public.guard_thread_assignee();

drop trigger if exists trg_guard_thread_assignee_upd on public.inbox_threads;
create trigger trg_guard_thread_assignee_upd
before update of assigned_to on public.inbox_threads
for each row execute procedure public.guard_thread_assignee();

-- Optional: event log for auditing assignment changes
alter table public.delivery_events
  drop constraint if exists delivery_events_event_check;

alter table public.delivery_events
  add constraint delivery_events_event_check
  check (event in (
    'sent','delivered','opened','clicked','bounced',
    'reply_detected','ooo_detected','unsubscribe_detected','manual_pause',
    'enqueue_blocked','thread_assigned','thread_unassigned'
  ));





