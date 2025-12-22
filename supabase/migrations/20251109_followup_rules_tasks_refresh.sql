-- Follow-up automation refresh (rules, tasks, helpers, RPCs)
-- Idempotent schema updates aligned with normalized message pipeline

-- Ensure followup_rules shape
create table if not exists public.followup_rules (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  labels text[] not null default array['question','neutral'],
  hours_wait int not null default 48,
  max_nudges int not null default 2,
  auto_send boolean not null default false,
  tone text not null default 'professional',
  enabled boolean not null default true
);

alter table public.followup_rules
  alter column labels set default array['question','neutral'],
  alter column hours_wait set default 48,
  alter column max_nudges set default 2,
  alter column auto_send set default false,
  alter column tone set default 'professional',
  alter column enabled set default true;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_rules'
      and column_name = 'meta'
  ) then
    -- tone used to default to "warm"; normalize legacy values
    update public.followup_rules
      set tone = 'professional'
      where tone = 'warm';
  end if;
exception when undefined_table then
  null;
end;
$$;

-- Align followup_tasks with new engine shape
create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source_message_id uuid references public.normalized_messages(id) on delete set null,
  nudge_no int not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','drafted','skipped','canceled','error')),
  attempt int not null default 0,
  error text,
  meta jsonb not null default '{}'::jsonb
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'scheduled_at'
  ) then
    alter table public.followup_tasks rename column scheduled_at to due_at;
  end if;
exception when undefined_column then
  null;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'last_inbound_id'
  ) then
    alter table public.followup_tasks rename column last_inbound_id to source_message_id;
  end if;
exception when undefined_column then
  null;
end;
$$;

alter table public.followup_tasks
  alter column nudge_no set not null,
  alter column due_at set not null,
  alter column status set default 'pending';

-- Legacy status normalization
update public.followup_tasks set status = 'pending' where status in ('queued');
update public.followup_tasks set status = 'processing' where status in ('running');
update public.followup_tasks set status = 'sent' where status in ('done');
update public.followup_tasks set status = 'error', error = coalesce(error, 'previous_failure') where status in ('failed');

alter table public.followup_tasks
  drop constraint if exists followup_tasks_status_check,
  add constraint followup_tasks_status_check
    check (status in ('pending','processing','sent','drafted','skipped','canceled','error'));

alter table public.followup_tasks
  add column if not exists attempt int not null default 0,
  add column if not exists error text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'reason'
  ) then
    alter table public.followup_tasks rename column reason to error;
  end if;
exception when undefined_column then
  null;
end;
$$;

alter table public.followup_tasks
  alter column error drop not null;

alter table public.followup_tasks
  alter column source_message_id drop not null;

alter table public.followup_tasks
  drop constraint if exists followup_tasks_last_inbound_id_fkey,
  drop constraint if exists followup_tasks_source_message_id_fkey;

alter table public.followup_tasks
  add constraint followup_tasks_source_message_id_fkey
    foreign key (source_message_id)
    references public.normalized_messages(id)
    on delete set null
    not valid;

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'idx_fut_campaign_due'
      and n.nspname = 'public'
  ) then
    create index idx_fut_campaign_due on public.followup_tasks(campaign_id, due_at);
  end if;
end;
$$;

create index if not exists idx_fut_status_due on public.followup_tasks(status, due_at);

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'uq_fut_unique'
      and n.nspname = 'public'
  ) then
    create unique index uq_fut_unique on public.followup_tasks(thread_id, nudge_no);
  end if;
end;
$$;

-- Ensure table RLS + policies
alter table public.followup_tasks enable row level security;

drop policy if exists "fut_read" on public.followup_tasks;
create policy "fut_read" on public.followup_tasks
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));

drop policy if exists "fut_write" on public.followup_tasks;
create policy "fut_write" on public.followup_tasks
  for update to authenticated
  using (public.is_campaign_editor(campaign_id) or public.is_campaign_owner(campaign_id))
  with check (public.is_campaign_editor(campaign_id) or public.is_campaign_owner(campaign_id));

-- Helpers
drop view if exists public.v_last_inbound_qualifying;
create or replace view public.v_last_inbound_qualifying as
with qualifying as (
  select
    t.id as thread_id,
    t.campaign_id,
    t.lead_id,
    nm.sent_at,
    nm.id as source_message_id
  from public.inbox_threads t
  join public.normalized_messages nm
    on nm.linked_thread_id = t.id
   and nm.direction = 'inbound'
  join public.followup_rules r
    on r.campaign_id = t.campaign_id
   and r.enabled
  where coalesce(nm.ai_label, '') = any(r.labels)
)
select distinct on (thread_id)
  thread_id,
  campaign_id,
  lead_id,
  sent_at as last_inbound_at,
  source_message_id
from qualifying
order by thread_id, sent_at desc nulls last, source_message_id desc;

create or replace view public.v_nudges_sent as
select
  thread_id,
  count(*) filter (where status in ('sent','drafted')) as nudges_done
from public.followup_tasks
group by thread_id;

drop view if exists public.v_followup_due;
create or replace view public.v_followup_due as
with base as (
  select
    q.thread_id,
    q.campaign_id,
    q.lead_id,
    q.last_inbound_at,
    q.source_message_id,
    r.hours_wait,
    r.max_nudges,
    r.auto_send,
    r.tone
  from public.v_last_inbound_qualifying q
  join public.followup_rules r
    on r.campaign_id = q.campaign_id
   and r.enabled
),
progress as (
  select
    b.*,
    coalesce(n.nudges_done, 0) as nudges_done
  from base b
  left join public.v_nudges_sent n
    on n.thread_id = b.thread_id
),
exclusions as (
  select distinct lead_id
  from public.campaign_leads
  where status in ('replied','unsub','bounced')
),
bounced as (
  select distinct thread_id
  from public.v_bounces
)
select
  p.campaign_id,
  p.thread_id,
  p.lead_id,
  p.source_message_id,
  (p.nudges_done + 1) as next_nudge_no,
  (p.last_inbound_at + (p.hours_wait || ' hours')::interval) as due_at,
  p.auto_send,
  p.tone
from progress p
left join exclusions x on x.lead_id = p.lead_id
left join bounced b on b.thread_id = p.thread_id
where x.lead_id is null
  and b.thread_id is null
  and p.nudges_done < p.max_nudges
  and now() >= (p.last_inbound_at + (p.hours_wait || ' hours')::interval);

-- RPCs
drop function if exists public.enqueue_followup_task(uuid);
create or replace function public.enqueue_followup_task(p_thread uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record record;
  v_id uuid;
begin
  select *
    into v_record
    from public.v_followup_due
   where thread_id = p_thread;

  if v_record is null then
    return null;
  end if;

  insert into public.followup_tasks (
    campaign_id,
    thread_id,
    lead_id,
    source_message_id,
    nudge_no,
    due_at,
    status,
    meta
  )
  values (
    v_record.campaign_id,
    v_record.thread_id,
    v_record.lead_id,
    v_record.source_message_id,
    v_record.next_nudge_no,
    v_record.due_at,
    'pending',
    jsonb_build_object(
      'tone', v_record.tone,
      'auto_send', v_record.auto_send
    )
  )
  on conflict (thread_id, nudge_no) do update
    set due_at = excluded.due_at
  returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.enqueue_all_followups(uuid);
create or replace function public.enqueue_all_followups(p_campaign uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cnt int;
begin
  insert into public.followup_tasks (
    campaign_id,
    thread_id,
    lead_id,
    source_message_id,
    nudge_no,
    due_at,
    status,
    meta
  )
  select
    campaign_id,
    thread_id,
    lead_id,
    source_message_id,
    next_nudge_no,
    due_at,
    'pending',
    jsonb_build_object(
      'tone', tone,
      'auto_send', auto_send
    )
  from public.v_followup_due
  where campaign_id = p_campaign
  on conflict (thread_id, nudge_no) do update
    set due_at = excluded.due_at;

  get diagnostics cnt = row_count;
  return cnt;
end;
$$;

-- Campaign event enum extensions
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'campaign_event_type'
      and e.enumlabel = 'followup_drafted'
  ) then
    alter type public.campaign_event_type add value if not exists 'followup_drafted';
  end if;

  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'campaign_event_type'
      and e.enumlabel = 'followup_sent'
  ) then
    alter type public.campaign_event_type add value if not exists 'followup_sent';
  end if;
exception when undefined_object then
  -- campaign_event_type may not exist in early environments
  null;
end;
$$;


