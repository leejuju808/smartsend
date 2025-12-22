-- Follow-up neutral nudge throttling, logging, and routing
set search_path = public, pg_temp;

-- ============================================================================
-- A) Logging table
-- ============================================================================
create table if not exists public.followup_nudges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  kind text not null default 'neutral_nudge',
  note text
);

create index if not exists idx_followup_nudges_thread on public.followup_nudges(thread_id);
create index if not exists idx_followup_nudges_campaign on public.followup_nudges(campaign_id);

alter table public.followup_nudges enable row level security;

drop policy if exists "nudges_select" on public.followup_nudges;
create policy "nudges_select" on public.followup_nudges
  for select
  to authenticated
  using (exists (
    select 1
      from public.campaign_members m
     where m.campaign_id = followup_nudges.campaign_id
       and m.user_id = auth.uid()
  ));

drop policy if exists "nudges_insert" on public.followup_nudges;
create policy "nudges_insert" on public.followup_nudges
  for insert
  to authenticated
  with check (exists (
    select 1
      from public.campaign_members m
     where m.campaign_id = followup_nudges.campaign_id
       and m.user_id = auth.uid()
  ));

-- ============================================================================
-- B) Activity helper view
-- ============================================================================
create or replace view public.v_thread_activity as
with msgs as (
  select
    thread_id,
    max(created_at) filter (where direction = 'inbound')  as last_inbound_at,
    max(created_at) filter (where direction = 'outbound') as last_outbound_at
  from public.inbox_messages
  group by thread_id
),
tracking as (
  select
    sl.thread_id,
    max(te.created_at) filter (where te.type = 'open')  as last_open_at,
    max(te.created_at) filter (where te.type = 'click') as last_click_at
  from public.send_logs sl
  left join public.tracking_events te on te.send_log_id = sl.id
  group by sl.thread_id
),
nudges as (
  select
    thread_id,
    max(created_at) as last_nudge_at
  from public.followup_nudges
  group by thread_id
)
select
  t.id as thread_id,
  t.campaign_id,
  msgs.last_inbound_at,
  msgs.last_outbound_at,
  tracking.last_open_at,
  tracking.last_click_at,
  nudges.last_nudge_at
from public.inbox_threads t
left join msgs on msgs.thread_id = t.id
left join tracking on tracking.thread_id = t.id
left join nudges on nudges.thread_id = t.id;

-- ============================================================================
-- C) Throttle guard
-- ============================================================================
drop function if exists public.can_nudge_thread(uuid);

create or replace function public.can_nudge_thread(p_thread uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_last_inbound timestamptz;
  v_last_nudge   timestamptz;
begin
  select last_inbound_at, last_nudge_at
    into v_last_inbound, v_last_nudge
  from public.v_thread_activity
  where thread_id = p_thread;

  if not found then
    return false;
  end if;

  if v_last_inbound is not null
     and v_last_inbound > now() - interval '48 hours' then
    return false;
  end if;

  if v_last_nudge is not null
     and v_last_nudge > now() - interval '5 days' then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.can_nudge_thread(uuid) from public;
grant execute on function public.can_nudge_thread(uuid) to authenticated;

-- ============================================================================
-- D) Ensure open nudge task for neutral replies
-- ============================================================================
drop function if exists public.ensure_nudge_task(uuid, uuid);

create or replace function public.ensure_nudge_task(p_thread uuid, p_campaign uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select id
    into v_id
  from public.followup_tasks
  where thread_id = p_thread
    and kind = 'nudge'
    and status = 'open'
  limit 1;

  if v_id is null then
    insert into public.followup_tasks (campaign_id, thread_id, kind, status, note)
    values (p_campaign, p_thread, 'nudge', 'open', 'auto-created on neutral')
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.ensure_nudge_task(uuid, uuid) from public;
grant execute on function public.ensure_nudge_task(uuid, uuid) to authenticated;

drop function if exists public.route_on_neutral() cascade;

create or replace function public.route_on_neutral()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.reply_type = 'neutral'
     and coalesce(old.reply_type, '') <> 'neutral' then
    perform public.ensure_nudge_task(new.id, new.campaign_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_route_on_neutral on public.inbox_threads;
create trigger trg_route_on_neutral
after update of reply_type on public.inbox_threads
for each row
execute function public.route_on_neutral();

-- ============================================================================
-- E) Edge function webhook trigger
-- ============================================================================
drop function if exists public.call_draft_neutral_nudge();

create or replace function public.call_draft_neutral_nudge()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text := public.edge_base_url() || '/draft-neutral-nudge';
  v_auth text := 'Bearer ' || current_setting('app.settings.service_role_key', true);
begin
  if new.reply_type = 'neutral'
     and coalesce(old.reply_type, '') <> 'neutral' then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', v_auth
      ),
      body := jsonb_build_object('thread_id', new.id)::text,
      timeout_milliseconds := 8000
    );
  end if;

  return new;
end;
$$;

revoke all on function public.call_draft_neutral_nudge() from public;
grant execute on function public.call_draft_neutral_nudge() to authenticated;

drop trigger if exists trg_call_draft_neutral_nudge on public.inbox_threads;
create trigger trg_call_draft_neutral_nudge
after update of reply_type on public.inbox_threads
for each row
execute function public.call_draft_neutral_nudge();

-- ============================================================================
create or replace view public.v_followup_candidates as
with base as (
  select
    t.id as thread_id,
    t.campaign_id,
    t.lead_id,
    t.last_inbound_at,
    r.hours_wait,
    r.max_nudges,
    coalesce(r.auto_send, false) as auto_send,
    r.tone,
    r.subject_template,
    r.body_template,
    coalesce((
      select max(f.nudge_num)
        from public.followup_tasks f
       where f.thread_id = t.id
         and f.status in ('new','drafted','sent','canceled','failed')
    ), 0) as already_nudged,
    (select max(n.created_at) from public.followup_nudges n where n.thread_id = t.id) as last_nudge_at
  from public.inbox_threads t
  join public.followup_rules r
    on r.campaign_id = t.campaign_id
  where t.needs_reply = true
    and t.replied_at is null
    and t.last_inbound_at is not null
)
select
  b.thread_id,
  b.campaign_id,
  b.lead_id,
  b.last_inbound_at,
  (b.already_nudged + 1) as next_nudge_num,
  (b.last_inbound_at + make_interval(hours => b.hours_wait)) as due_at,
  b.auto_send,
  b.tone,
  b.subject_template,
  b.body_template
from base b
where (b.already_nudged + 1) <= b.max_nudges
  and now() >= (b.last_inbound_at + make_interval(hours => b.hours_wait))
  and (
    b.last_nudge_at is null
    or b.last_nudge_at <= now() - interval '5 days'
  )
  and (
    b.last_inbound_at is null
    or b.last_inbound_at <= now() - interval '48 hours'
  );

alter view public.v_followup_candidates set (security_invoker = on);


