-- Inbox helper views and RPCs

-- Ensure thread flags exist for bounce/unsubscribe autopause
alter table public.inbox_threads
  add column if not exists bounced_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists closed_at timestamptz;

-- Centralized autopause helper to stop threads idempotently
create or replace function public._autopause_thread(
  p_thread uuid,
  p_reason text,
  p_when timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_reason = 'bounce' then
    update public.inbox_threads
      set bounced_at = coalesce(bounced_at, p_when),
          stopped_by_reply = true,
          updated_at = now()
    where id = p_thread;
  elsif p_reason = 'unsubscribe' then
    update public.inbox_threads
      set unsubscribed_at = coalesce(unsubscribed_at, p_when),
          stopped_by_reply = true,
          updated_at = now()
    where id = p_thread;
  else
    update public.inbox_threads
      set stopped_by_reply = true,
          updated_at = now()
    where id = p_thread;
  end if;

  perform public.cancel_future_queue_for_thread(p_thread);
end;
$$;

-- Campaign membership helper (owner or editor)
create or replace function public._is_campaign_member_editor(
  p_campaign uuid,
  p_user uuid
)
returns boolean
language sql
stable
as $$
  select
    exists (
      select 1
      from public.campaigns c
      where c.id = p_campaign
        and c.user_id = p_user
    )
    or exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = p_campaign
        and m.user_id = p_user
        and m.role in ('owner', 'editor')
    );
$$;

-- Trigger: inbox_messages → stop on AI labels
drop trigger if exists trg_msg_autopause on public.inbox_messages;

create or replace function public._on_message_autopause()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_label text;
  v_thread uuid;
  v_when timestamptz;
begin
  v_label := coalesce(new.ai_label, '');
  v_thread := new.thread_id;
  v_when := new.created_at;

  if lower(v_label) in ('bounce', 'hard_bounce', 'soft_bounce') then
    perform public._autopause_thread(v_thread, 'bounce', v_when);
  elsif lower(v_label) in ('unsubscribe', 'opt_out', 'do_not_contact') then
    perform public._autopause_thread(v_thread, 'unsubscribe', v_when);
  end if;

  return new;
end;
$$;

create trigger trg_msg_autopause
after insert on public.inbox_messages
for each row execute function public._on_message_autopause();

-- Trigger: delivery_events → stop on provider bounces
drop trigger if exists trg_delivery_autopause on public.delivery_events;

create or replace function public._on_delivery_autopause()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_event text;
  v_thread uuid;
  v_when timestamptz;
begin
  v_event := lower(coalesce(new.event, ''));
  v_when := new.created_at;

  if v_event like '%bounc%' then
    select thread_id
      into v_thread
    from public.send_logs
    where id = new.log_id
    limit 1;

    if v_thread is not null then
      perform public._autopause_thread(v_thread, 'bounce', v_when);
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_delivery_autopause
after insert on public.delivery_events
for each row execute function public._on_delivery_autopause();

-- Last inbound/meta per thread for fast lists
create or replace view public.v_inbox_threads as
select
  t.id,
  t.campaign_id,
  t.lead_id,
  t.provider,
  t.provider_thread_id,
  t.updated_at,
  t.replied_at,
  t.replied_message_id,
  t.reply_reason,
  t.needs_reply,
  t.stopped_by_reply,
  t.bounced_at,
  t.unsubscribed_at,
  t.snoozed_until,
  t.ai_intent,
  t.ai_confidence,
  coalesce(t.ai_intent, 'unknown') as ai_intent_safe,
  coalesce(t.ai_confidence, 0.0) as ai_confidence_safe,
  (t.snoozed_until is not null and t.snoozed_until > now()) as is_snoozed,
  exists (
    select 1
    from public.followup_tasks f
    where f.lead_id = t.lead_id
      and f.done = false
      and coalesce(f.paused, false) = true
  ) as is_paused,
  t.assigned_to,
  p.full_name as assigned_to_name,
  l.email as lead_email,
  l.domain as lead_domain,
  -- last inbound message snapshot
  (
    select m.created_at
    from public.inbox_messages m
    where m.thread_id = t.id
      and m.direction = 'inbound'
    order by m.created_at desc
    limit 1
  ) as last_inbound_at,
  (
    select m.id
    from public.inbox_messages m
    where m.thread_id = t.id
      and m.direction = 'inbound'
    order by m.created_at desc
    limit 1
  ) as last_inbound_id,
  (
    select m.snippet
    from public.inbox_messages m
    where m.thread_id = t.id
    order by m.created_at desc
    limit 1
  ) as last_snippet,
  -- last AI label (from any message) to help triage
  (
    select m.ai_label
    from public.inbox_messages m
    where m.thread_id = t.id
      and m.direction = 'inbound'
      and m.ai_label is not null
    order by m.created_at desc
    limit 1
  ) as last_ai_label,
  (
    select m.ai_score
    from public.inbox_messages m
    where m.thread_id = t.id
      and m.direction = 'inbound'
      and m.ai_score is not null
    order by m.created_at desc
    limit 1
  ) as last_ai_score,
  (
    select m.ai_reason
    from public.inbox_messages m
    where m.thread_id = t.id
      and m.direction = 'inbound'
      and m.ai_reason is not null
      and length(trim(m.ai_reason)) > 0
    order by m.created_at desc
    limit 1
  ) as last_ai_reason,
  coalesce(
    (
      select max(m2.created_at)
      from public.inbox_messages m2
      where m2.thread_id = t.id
    ),
    t.updated_at
  ) as last_message_at,
  greatest(
    t.updated_at,
    coalesce(
      (
        select max(m3.created_at)
        from public.inbox_messages m3
        where m3.thread_id = t.id
      ),
      'epoch'::timestamptz
    )
  ) as sort_key
from public.inbox_threads t
join public.leads l on l.id = t.lead_id
left join public.profiles p on p.id = t.assigned_to;

grant select on public.v_inbox_threads to authenticated;


-- Filtered listings for inbox threads (search/pagination)
create or replace function public.list_threads_filtered(
  p_filter text default 'all',
  p_ai_label text default null,
  p_q text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns setof public.v_inbox_threads
language sql
stable
security definer
set search_path=public
as $$
  with base as (
    select *
    from public.v_inbox_threads vit
    where exists (
      select 1
      from public.campaigns c
      where c.id = vit.campaign_id
        and c.user_id = auth.uid()
    )
    and (
      p_q is null
      or vit.lead_email ilike '%' || p_q || '%'
      or vit.lead_domain ilike '%' || p_q || '%'
    )
    and (
      p_ai_label is null
      or lower(coalesce(vit.last_ai_label, '')) = lower(p_ai_label)
    )
  ),
  filtered as (
    select *
    from base
    where case
      when p_filter = 'meeting' then lower(coalesce(last_ai_label, '')) = 'meeting'
      when p_filter = 'positive' then lower(coalesce(last_ai_label, '')) = 'positive'
      when p_filter = 'question' then lower(coalesce(last_ai_label, '')) = 'question'
      when p_filter = 'ooo' then lower(coalesce(last_ai_label, '')) = 'ooo'
      when p_filter = 'unsubscribe' then lower(coalesce(last_ai_label, '')) = 'unsubscribe'
      when p_filter = 'bounce' then lower(coalesce(last_ai_label, '')) = 'bounce'
      when p_filter = 'needs' then needs_reply is true
      when p_filter = 'open' then replied_at is null and stopped_by_reply is not true
      when p_filter = 'replied' then replied_at is not null
      when p_filter = 'bounced' then bounced_at is not null
      when p_filter = 'unsub' then unsubscribed_at is not null
      when p_filter = 'stopped' then stopped_by_reply is true
      else true
    end
  )
  select *
  from filtered
  order by sort_key desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.list_threads_filtered(text, text, text, int, int) to authenticated;
grant execute on function public.list_threads_filtered(text, text, text, int, int) to service_role;


-- Counts per filter for inbox tabs
create or replace function public.inbox_filter_counts(
  p_q text default null,
  p_ai_label text default null
)
returns table (
  all_count int,
  needs_count int,
  replied_count int
)
language sql
stable
security definer
set search_path=public
as $$
  with base as (
    select *
    from public.v_inbox_threads vit
    where exists (
      select 1
      from public.campaigns c
      where c.id = vit.campaign_id
        and c.user_id = auth.uid()
    )
    and (
      p_q is null
      or vit.lead_email ilike '%' || p_q || '%'
      or vit.lead_domain ilike '%' || p_q || '%'
    )
    and (
      p_ai_label is null
      or lower(coalesce(vit.last_ai_label, '')) = lower(p_ai_label)
    )
  )
  select
    count(*) as all_count,
    count(*) filter (where needs_reply is true) as needs_count,
    count(*) filter (where replied_at is not null) as replied_count
  from base;
$$;

grant execute on function public.inbox_filter_counts(text, text) to authenticated;
grant execute on function public.inbox_filter_counts(text, text) to service_role;


-- Fast counters for inbox filters
create or replace view public.v_inbox_counts as
select
  count(*) filter (where needs_reply is true) as needs_reply_threads,
  count(*) filter (where replied_at is not null) as replied_threads
from public.inbox_threads t;

grant select on public.v_inbox_counts to authenticated;


-- RPC: mark replied + stop future sends (wire into composer send)
create or replace function public.mark_replied_and_stop(p_thread uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.inbox_threads
  set replied_at = coalesce(replied_at, now()),
      stopped_by_reply = true
  where id = p_thread;

  perform public.cancel_future_queue_for_thread(p_thread);
end;
$$;

grant execute on function public.mark_replied_and_stop(uuid) to authenticated;
grant execute on function public.mark_replied_and_stop(uuid) to service_role;


-- Minimal enqueue for a reply (uses existing send_queue)
create or replace function public.enqueue_reply_for_thread(p_thread uuid, p_body_html text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_queue uuid;
  v_campaign uuid;
  v_lead uuid;
begin
  select t.campaign_id, t.lead_id
    into v_campaign, v_lead
  from public.inbox_threads t
  where t.id = p_thread;

  insert into public.send_queue (campaign_id, lead_id, thread_id, step_no, payload)
  values (v_campaign, v_lead, p_thread, 0, jsonb_build_object('type', 'reply', 'body_html', p_body_html))
  returning id into v_queue;

  return v_queue;
end;
$$;

grant execute on function public.enqueue_reply_for_thread(uuid, text) to authenticated;
grant execute on function public.enqueue_reply_for_thread(uuid, text) to service_role;


-- RLS: read your own tenant only
do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'inbox threads by owner'
  ) then
    create policy "inbox threads by owner" on public.inbox_threads
      for select using (
        exists (
          select 1
          from public.campaigns c
          where c.id = inbox_threads.campaign_id
            and c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'inbox threads by owner update'
  ) then
    create policy "inbox threads by owner update" on public.inbox_threads
      for update using (
        exists (
          select 1
          from public.campaigns c
          where c.id = inbox_threads.campaign_id
            and c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'inbox msgs by owner'
  ) then
    create policy "inbox msgs by owner" on public.inbox_messages
      for select using (
        exists (
          select 1
          from public.inbox_threads t
          join public.campaigns c on c.id = t.campaign_id
          where t.id = inbox_messages.thread_id
            and c.user_id = auth.uid()
        )
      );
  end if;
end;
$$;


-- Bulk thread operations ------------------------------------------------------
create or replace function public.bulk_stop_threads(p_threads uuid[])
returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count int := 0;
  v_campaign uuid;
begin
  if array_length(p_threads, 1) is null then
    return 0;
  end if;

  for v_campaign in
    select distinct t.campaign_id
    from public.inbox_threads t
    where t.id = any(p_threads)
  loop
    if not public._is_campaign_member_editor(v_campaign, auth.uid()) then
      raise exception 'Not allowed on one or more threads';
    end if;
  end loop;

  update public.inbox_threads t
     set stopped_by_reply = true,
         updated_at = now()
   where id = any(p_threads);

  get diagnostics v_count = row_count;

  perform public.cancel_future_queue_for_thread(id)
  from public.inbox_threads
  where id = any(p_threads);

  return v_count;
end;
$$;

grant execute on function public.bulk_stop_threads(uuid[]) to authenticated;
grant execute on function public.bulk_stop_threads(uuid[]) to service_role;


create or replace function public.bulk_close_threads(p_threads uuid[])
returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count int := 0;
  v_campaign uuid;
begin
  if array_length(p_threads, 1) is null then
    return 0;
  end if;

  for v_campaign in
    select distinct t.campaign_id
    from public.inbox_threads t
    where t.id = any(p_threads)
  loop
    if not public._is_campaign_member_editor(v_campaign, auth.uid()) then
      raise exception 'Not allowed on one or more threads';
    end if;
  end loop;

  update public.inbox_threads
     set closed_at = coalesce(closed_at, now()),
         updated_at = now()
   where id = any(p_threads);

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

grant execute on function public.bulk_close_threads(uuid[]) to authenticated;
grant execute on function public.bulk_close_threads(uuid[]) to service_role;


create or replace function public.bulk_assign_threads(p_threads uuid[], p_user uuid)
returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count int := 0;
  v_campaign uuid;
begin
  if array_length(p_threads, 1) is null then
    return 0;
  end if;

  if p_user is null then
    raise exception 'Assignee is required';
  end if;

  for v_campaign in
    select distinct t.campaign_id
    from public.inbox_threads t
    where t.id = any(p_threads)
  loop
    if not public._is_campaign_member_editor(v_campaign, auth.uid()) then
      raise exception 'You cannot assign threads you do not control';
    end if;

    if not public._is_campaign_member_editor(v_campaign, p_user) then
      raise exception 'Assignee is not an editor/member for one or more campaigns';
    end if;
  end loop;

  update public.inbox_threads
     set assigned_to = p_user,
         updated_at = now()
   where id = any(p_threads);

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

grant execute on function public.bulk_assign_threads(uuid[], uuid) to authenticated;
grant execute on function public.bulk_assign_threads(uuid[], uuid) to service_role;
