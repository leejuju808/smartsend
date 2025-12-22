-- AI Reply Detection System
-- Adds columns, heuristics, triggers, and indexes for automated reply classification

-- 1. Campaign-level toggle
alter table public.campaigns
  add column if not exists auto_reply_detection boolean default true;

-- 2. Email events metadata (extend existing email_events table)
alter table public.email_events
  add column if not exists direction text check (direction in ('inbound','outbound')),
  add column if not exists raw_headers jsonb,
  add column if not exists ai_reply_kind text check (ai_reply_kind in ('human','ooo','auto','bounce','unsubscribe','spam','unknown')),
  add column if not exists ai_confidence numeric check (ai_confidence between 0 and 1),
  add column if not exists classified_at timestamptz,
  add column if not exists thread_id uuid references public.lead_threads(id) on delete set null,
  add column if not exists subject text,
  add column if not exists snippet text,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

-- Index for AI classification polling
create index if not exists idx_email_events_classify
  on public.email_events (campaign_id, created_at desc) 
  where ai_reply_kind is null and direction = 'inbound';

-- Index for thread lookup
create index if not exists idx_email_events_thread on public.email_events(thread_id) where thread_id is not null;

-- 3. Thread rollups for UI
alter table public.lead_threads
  add column if not exists last_inbound_at timestamptz,
  add column if not exists ai_last_reply_kind text check (ai_last_reply_kind in ('human','ooo','auto','bounce','unsubscribe','spam','unknown'));

-- Index for thread updates
create index if not exists idx_lead_threads_last_inbound on public.lead_threads(last_inbound_at desc) where last_inbound_at is not null;

-- 4. Lightweight SQL heuristic function (instant, before AI)
create or replace function public.heuristic_reply_kind(
  p_subject text, 
  p_headers jsonb, 
  p_body text
) returns text
language sql immutable as $$
  with hints as (
    select
      case
        when p_headers ?| array['Auto-Submitted','X-Autoreply','X-Out-Of-Office'] then 'ooo'
        when p_subject ~* '^(re:|fw:|fwd:)' and coalesce(length(p_body),0) > 20 then 'human'
        when p_subject ~* '(undeliver|delivery status|failure notice|bounce)' then 'bounce'
        when p_body ~* '(unsubscribe|stop emailing|remove me)' then 'unsubscribe'
        when p_subject ~* '(auto.?reply|out of office|vacation)' then 'ooo'
        else 'unknown'
      end as kind
  )
  select kind from hints;
$$;

-- 5. Trigger: stamp thread, set quick status if obvious
create or replace function public.on_email_event_after_insert()
returns trigger language plpgsql as $$
declare
  v_kind text;
  v_auto boolean := false;
begin
  if new.direction <> 'inbound' then
    return new;
  end if;

  v_kind := public.heuristic_reply_kind(new.subject, new.raw_headers, new.snippet);

  -- Update thread with last inbound timestamp and heuristic classification
  if new.thread_id is not null then
    update public.lead_threads
       set last_inbound_at = coalesce(last_inbound_at, new.created_at),
           ai_last_reply_kind = coalesce(v_kind, 'unknown'),
           updated_at = now()
     where id = new.thread_id;
  end if;

  -- If heuristic is clearly 'bounce' or 'ooo', don't mark replied.
  -- If 'human', tentatively flip to 'replied' (AI step may refine later).
  if exists (select 1 from public.campaigns c where c.id = new.campaign_id and c.auto_reply_detection) then
    if v_kind = 'human' and new.thread_id is not null then
      update public.lead_threads 
      set status = 'replied' 
      where id = new.thread_id and status = 'open';
    end if;
  end if;

  return new;
end;
$$;

-- Drop and recreate trigger
drop trigger if exists trg_email_event_after_insert on public.email_events;
create trigger trg_email_event_after_insert
after insert on public.email_events
for each row execute function public.on_email_event_after_insert();

-- Grant execute on heuristic function
grant execute on function public.heuristic_reply_kind(text, jsonb, text) to authenticated, service_role;

