-- Reply review queue, classification thresholds, and helpers

-- Campaign-level configuration
alter table public.campaigns
  add column if not exists cls_conf_threshold real not null default 0.72,
  add column if not exists cls_debounce_seconds int not null default 90;

-- Review queue for manual follow-up
create table if not exists public.reply_review_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  last_ai_intent text,
  last_ai_confidence real,
  reason text not null,
  note text
);

create index if not exists idx_rrq_open on public.reply_review_queue(thread_id) where resolved_at is null;

-- Inbox thread flags for UI shortcuts
alter table public.inbox_threads
  add column if not exists needs_review boolean not null default false,
  add column if not exists last_classified_at timestamptz,
  add column if not exists last_classify_err text;

-- Ensure single open review item per thread
create or replace function public.enqueue_review(p_thread_id uuid, p_reason text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  select id
    into v_id
  from public.reply_review_queue
  where thread_id = p_thread_id
    and resolved_at is null
  limit 1;

  if v_id is null then
    insert into public.reply_review_queue(thread_id, reason, note)
    values (p_thread_id, p_reason, p_note)
    returning id into v_id;
  else
    update public.reply_review_queue
       set reason = p_reason,
           note = coalesce(p_note, note)
     where id = v_id;
  end if;

  update public.inbox_threads
     set needs_review = true
   where id = p_thread_id;

  return v_id;
end;
$$;

-- Resolve helper that clears the flag
create or replace function public.resolve_review(p_thread_id uuid, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.reply_review_queue
     set resolved_at = now(),
         resolved_by = p_user
   where thread_id = p_thread_id
     and resolved_at is null;

  update public.inbox_threads
     set needs_review = false
   where id = p_thread_id;
end;
$$;

-- Trigger helper: invoke classify edge with debounce + keyword hints
create or replace function public.tg_call_classify_reply()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := current_setting('app.classify_reply_url', true);
  v_auth text := current_setting('app.classify_reply_auth', true);
  v_campaign uuid;
  v_debounce int := 90;
  v_last timestamptz;
  v_payload jsonb;
  v_resp jsonb;
  v_body text := coalesce(new.body_text, '');
  v_unsub boolean := v_body ~* '(unsubscribe|remove me|opt[- ]?out|stop emailing|do not contact)';
  v_ooo boolean := v_body ~* '(out of office|on vacation|back on|returning on|away until)';
begin
  if new.direction <> 'inbound' then
    return new;
  end if;

  select t.campaign_id,
         t.last_classified_at,
         c.cls_debounce_seconds
    into v_campaign, v_last, v_debounce
  from public.inbox_threads t
  join public.campaigns c on c.id = t.campaign_id
  where t.id = new.thread_id;

  if v_last is not null
     and now() - v_last < make_interval(secs => v_debounce) then
    perform public.enqueue_review(new.thread_id, 'throttle', 'Debounced rapid reclassify');
    return new;
  end if;

  v_payload := jsonb_build_object(
    'thread_id', new.thread_id,
    'body_text', v_body,
    'hints', jsonb_build_object(
      'keyword_unsubscribe', v_unsub,
      'keyword_ooo', v_ooo
    )
  );

  select net.http_post(
           url := v_url,
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'Authorization', v_auth
           ),
           body := v_payload::text,
           timeout_milliseconds := 8000
         )::jsonb
    into v_resp;

  return new;
exception
  when others then
    update public.inbox_threads
       set last_classify_err = sqlerrm
     where id = new.thread_id;
    perform public.enqueue_review(new.thread_id, 'manual', 'HTTP classify error');
    return new;
end;
$$;

drop trigger if exists trg_call_classify_reply on public.inbox_messages;
create trigger trg_call_classify_reply
after insert on public.inbox_messages
for each row execute function public.tg_call_classify_reply();

-- Update gating helper for auto-nudge to respect review flags
create or replace function public.can_nudge_thread(p_thread uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_last_inbound timestamptz;
  v_last_nudge timestamptz;
  v_campaign uuid;
  v_min_after_inbound int := 48;
  v_min_between int := 5;
  v_conf real;
  v_needs_review boolean;
  v_threshold real := 0.72;
begin
  select t.campaign_id,
         t.ai_confidence,
         t.needs_review,
         c.cls_conf_threshold
    into v_campaign,
         v_conf,
         v_needs_review,
         v_threshold
    from public.inbox_threads t
    join public.campaigns c on c.id = t.campaign_id
   where t.id = p_thread;

  if v_campaign is null then
    return false;
  end if;

  if v_needs_review then
    return false;
  end if;

  if v_conf is null or v_conf < coalesce(v_threshold, 0.72) then
    return false;
  end if;

  select
    cs.min_hours_after_inbound,
    cs.min_days_between_nudges
    into v_min_after_inbound,
         v_min_between
    from public.classifier_settings cs
   where cs.campaign_id = v_campaign;

  select last_inbound_at,
         last_nudge_at
    into v_last_inbound,
         v_last_nudge
    from public.v_thread_activity
   where thread_id = p_thread;

  if v_last_inbound is not null
     and v_last_inbound > now() - make_interval(hours => v_min_after_inbound) then
    return false;
  end if;

  if v_last_nudge is not null
     and v_last_nudge > now() - make_interval(days => v_min_between) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.can_nudge_thread(uuid) from public;
grant execute on function public.can_nudge_thread(uuid) to authenticated;


-- Helper to suppress leads directly from a thread context
create or replace function public.suppress_lead_from_thread(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_lead uuid;
begin
  select lead_id
    into v_lead
  from public.inbox_threads
  where id = p_thread_id;

  if v_lead is not null then
    perform public.suppress_lead(
      v_lead,
      'unsubscribe',
      'account',
      null,
      'inbound',
      'fail-safe keyword/low-conf'
    );

    update public.inbox_threads
       set is_suppressed = true,
           suppressed_at = now(),
           suppressed_reason = 'unsubscribe'
     where id = p_thread_id;
  end if;
end;
$$;


