-- Follow-up nudger refresh: rules, tasks, views, and enqueue helper
-- Idempotent by design so it can be run safely multiple times.

-- Ensure follow-up rules table exists with required columns/defaults
create table if not exists public.followup_rules (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  labels text[] not null default '{human_reply,question,positive,neutral}',
  hours_wait int not null default 48,
  max_nudges int not null default 2,
  auto_send boolean not null default false,
  tone text not null default 'professional',
  style text not null default 'plain',
  max_len int not null default 300,
  cta_hint text not null default 'Propose a quick 15-min call this week.'
);

alter table public.followup_rules
  alter column labels set default '{human_reply,question,positive,neutral}';

alter table public.followup_rules
  alter column tone set default 'professional';

alter table public.followup_rules
  alter column style set default 'plain';

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_rules' and column_name = 'max_len'
  ) then
    alter table public.followup_rules
      add column max_len int not null default 300;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_rules' and column_name = 'cta_hint'
  ) then
    alter table public.followup_rules
      add column cta_hint text not null default 'Propose a quick 15-min call this week.';
  end if;
end;
$$;

-- Helper enum for follow-up task statuses
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'followup_status' and n.nspname = 'public'
  ) then
    create type public.followup_status as enum ('queued','drafted','sent','skipped','error');
  end if;
end;
$$;

-- Ensure all required enum values exist
do $$
declare
  v_label text;
begin
  foreach v_label in array array['queued','drafted','sent','skipped','error'] loop
    if exists (
      select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where t.typname = 'followup_status'
        and n.nspname = 'public'
    ) and not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where t.typname = 'followup_status'
        and n.nspname = 'public'
        and e.enumlabel = v_label
    ) then
      execute format('alter type public.followup_status add value %L', v_label);
    end if;
  end loop;
end;
$$;

-- Ensure follow-up tasks table exists with required shape
create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_at timestamptz not null default now(),
  status public.followup_status not null default 'queued',
  reason text,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  rule_snapshot jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  last_error text,
  draft_id uuid references public.drafts(id) on delete set null,
  message_id uuid
);

-- Align legacy columns to new schema
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'scheduled_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'run_at'
  ) then
    alter table public.followup_tasks rename column scheduled_at to run_at;
  end if;
end;
$$;

alter table public.followup_tasks
  alter column run_at set default now();

-- Coerce status column to enum and clean up old values
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'status'
      and data_type <> 'USER-DEFINED'
  ) then
    update public.followup_tasks set status = 'queued' where status in ('pending','running');
    update public.followup_tasks set status = 'error' where status in ('failed','canceled');
    alter table public.followup_tasks
      alter column status type public.followup_status
      using status::public.followup_status;
  end if;
end;
$$;

alter table public.followup_tasks
  alter column status set default 'queued';

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'reason'
  ) then
    alter table public.followup_tasks add column reason text;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'rule_snapshot'
  ) then
    alter table public.followup_tasks add column rule_snapshot jsonb not null default '{}'::jsonb;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'meta'
  ) then
    alter table public.followup_tasks alter column meta type jsonb using coalesce(meta, '{}'::jsonb);
    alter table public.followup_tasks alter column meta set default '{}'::jsonb;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'attempts'
  ) then
    alter table public.followup_tasks add column attempts int not null default 0;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'last_error'
  ) then
    alter table public.followup_tasks add column last_error text;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'draft_id'
  ) then
    alter table public.followup_tasks add column draft_id uuid references public.drafts(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'message_id'
  ) then
    alter table public.followup_tasks add column message_id uuid;
  end if;
end;
$$;

-- Drop obsolete unique constraint if present
alter table public.followup_tasks
  drop constraint if exists followup_tasks_thread_id_nudge_no_key;

-- Drop legacy indexes if they exist
drop index if exists idx_fu_tasks_sched;
drop index if exists idx_fu_tasks_thread;
drop index if exists idx_fu_tasks_campaign;

-- Rebuild indexes for new workflow
create index if not exists idx_futasks_status_runat on public.followup_tasks(status, run_at);
create index if not exists idx_futasks_campaign on public.followup_tasks(campaign_id);

-- Partial unique index for active work (queued/drafted)
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_followup_tasks_unique_active'
  ) then
    execute $sql$
      create unique index idx_followup_tasks_unique_active
      on public.followup_tasks(thread_id, status)
      where status in ('queued','drafted');
    $sql$;
  end if;
end;
$$;

-- Current counts of drafted/sent nudges per thread
create or replace view public.v_followup_counts as
select
  t.thread_id,
  count(*) filter (where status in ('drafted','sent')) as nudges_done
from public.followup_tasks t
group by 1;

-- Last inbound message per thread
create or replace view public.v_last_inbound as
select distinct on (nm.linked_thread_id)
  nm.linked_thread_id as thread_id,
  nm.id as message_id,
  nm.sent_at,
  coalesce(nm.ai_label, '') as ai_label,
  nm.subject,
  nm.body
from public.normalized_messages nm
where nm.direction = 'inbound'
order by nm.linked_thread_id, nm.sent_at desc;

-- Last outbound message per thread
create or replace view public.v_last_outbound as
select distinct on (nm.linked_thread_id)
  nm.linked_thread_id as thread_id,
  nm.id as message_id,
  nm.sent_at,
  coalesce(nm.ai_label, '') as ai_label,
  nm.subject,
  nm.body
from public.normalized_messages nm
where nm.direction = 'outbound'
order by nm.linked_thread_id, nm.sent_at desc;

-- Threads that are currently due for a follow-up nudge
create or replace view public.v_followup_due as
with ctx as (
  select
    th.id as thread_id,
    th.campaign_id,
    th.lead_id,
    li.sent_at as last_inbound_at,
    li.ai_label as last_inbound_label,
    lo.sent_at as last_outbound_at,
    r.labels,
    r.hours_wait,
    r.max_nudges,
    r.auto_send,
    r.tone,
    r.style,
    r.max_len,
    r.cta_hint
  from public.inbox_threads th
  join public.v_last_inbound li on li.thread_id = th.id
  left join public.v_last_outbound lo on lo.thread_id = th.id
  join public.followup_rules r on r.campaign_id = th.campaign_id
)
select
  c.thread_id,
  c.campaign_id,
  c.lead_id,
  c.last_inbound_at,
  c.last_inbound_label,
  c.last_outbound_at,
  c.hours_wait,
  c.max_nudges,
  c.auto_send,
  c.tone,
  c.style,
  c.max_len,
  c.cta_hint
from ctx c
left join public.v_followup_counts fc on fc.thread_id = c.thread_id
left join public.followup_tasks active
  on active.thread_id = c.thread_id
  and active.status in ('queued','drafted')
where
  c.last_inbound_label = any(c.labels)
  and (now() - c.last_inbound_at) >= make_interval(hours => c.hours_wait)
  and (c.last_outbound_at is null or c.last_outbound_at <= c.last_inbound_at)
  and coalesce(fc.nudges_done, 0) < c.max_nudges
  and active.id is null;

-- Secure RPC to enqueue due follow-up nudges
create or replace function public.enqueue_followups(p_limit int default 100)
returns int
language plpgsql
security definer
as $$
declare
  v_rows int := 0;
begin
  with due as (
    select d.*
    from public.v_followup_due d
    where public.is_campaign_editor(d.campaign_id)
    limit p_limit
  )
  insert into public.followup_tasks (
    campaign_id,
    thread_id,
    lead_id,
    run_at,
    status,
    reason,
    rule_snapshot
  )
  select
    campaign_id,
    thread_id,
    lead_id,
    now(),
    'queued',
    'no human send within ' || hours_wait || 'h after inbound',
    jsonb_build_object(
      'auto_send', auto_send,
      'tone', tone,
      'style', style,
      'max_len', max_len,
      'cta_hint', cta_hint,
      'hours_wait', hours_wait,
      'max_nudges', max_nudges
    )
  from due
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  return coalesce(v_rows, 0);
end;
$$;

-- Row level security policies for follow-up tasks
alter table public.followup_tasks enable row level security;

drop policy if exists futasks_read on public.followup_tasks;
create policy futasks_read on public.followup_tasks
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));

drop policy if exists futasks_block_writes on public.followup_tasks;
create policy futasks_block_writes on public.followup_tasks
  for all to authenticated
  using (false)
  with check (false);

