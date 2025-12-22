-- Follow-up automation pipeline (rules, tasks, views, RPC)
-- Idempotent so it can be re-run safely.

-- ============================================================================
-- A) Follow-up rules
-- ============================================================================
create table if not exists public.followup_rules (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  labels text[] not null default '{human_reply,question,positive,neutral}',
  hours_wait int not null default 48,
  max_nudges int not null default 2,
  auto_send boolean not null default false,
  tone text not null default 'professional',
  length text not null default 'short'
);

alter table public.followup_rules
  alter column labels set default '{human_reply,question,positive,neutral}',
  alter column hours_wait set default 48,
  alter column max_nudges set default 2,
  alter column auto_send set default false,
  alter column tone set default 'professional';

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_rules'
      and column_name = 'length'
  ) then
    alter table public.followup_rules
      add column length text not null default 'short';
  end if;
end;
$$;

-- ============================================================================
-- B) Follow-up task ledger
-- ============================================================================
create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source_message_id uuid references public.normalized_messages(id) on delete set null,
  nudge_index int not null default 1,
  status text not null default 'queued',
  auto_sent boolean not null default false
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'nudge_index'
  ) then
    alter table public.followup_tasks
      add column nudge_index int;
  end if;
end;
$$;

update public.followup_tasks
   set nudge_index = coalesce(nudge_index, 1)
 where nudge_index is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'nudge_num'
  ) then
    update public.followup_tasks
       set nudge_index = nudge_num
     where nudge_index = 1
       and nudge_num is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'nudge_no'
  ) then
    update public.followup_tasks
       set nudge_index = nudge_no
     where nudge_no is not null;
  end if;
end;
$$;

alter table public.followup_tasks
  alter column nudge_index set not null,
  alter column nudge_index set default 1;

-- Ensure source_message_id column exists and references normalized_messages
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'source_message_id'
  ) then
    alter table public.followup_tasks
      add column source_message_id uuid;
  end if;
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
    update public.followup_tasks
       set source_message_id = coalesce(source_message_id, last_inbound_id)
     where source_message_id is null;
  end if;
end;
$$;

alter table public.followup_tasks
  drop constraint if exists followup_tasks_source_message_id_fkey;

alter table public.followup_tasks
  add constraint followup_tasks_source_message_id_fkey
    foreign key (source_message_id) references public.normalized_messages(id) on delete set null;

-- Harmonize status values
update public.followup_tasks
   set status = 'queued'
 where status in ('pending','processing','new','running');

update public.followup_tasks
   set status = 'drafted'
 where status in ('drafted','planning','ready');

update public.followup_tasks
   set status = 'sent'
 where status in ('sent','done','completed');

update public.followup_tasks
   set status = 'skipped'
 where status in ('canceled','cancelled','skipped');

update public.followup_tasks
   set status = 'failed'
 where status in ('failed','error');

alter table public.followup_tasks
  alter column status set default 'queued';

alter table public.followup_tasks
  drop constraint if exists followup_tasks_status_check;

alter table public.followup_tasks
  add constraint followup_tasks_status_check
    check (status in ('queued','drafted','sent','skipped','failed','pending','processing','done','completed','error','canceled','cancelled','running','working','new'));

-- Ensure auto_sent column exists
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'auto_sent'
  ) then
    alter table public.followup_tasks
      add column auto_sent boolean not null default false;
  end if;
end;
$$;

-- Maintain useful legacy columns if they exist (no-op otherwise)
alter table public.followup_tasks
  alter column created_at set default now();

-- Indexes / uniqueness
drop index if exists uq_followup_thread_nudge;
drop index if exists idx_followup_tasks_unique_active;
drop index if exists idx_followup_tasks_thread;
drop index if exists idx_followup_tasks_thread_on_status;

create index if not exists idx_followup_tasks_thread on public.followup_tasks(thread_id);

create unique index if not exists ux_followup_unique
  on public.followup_tasks(thread_id, nudge_index);

-- ============================================================================
-- C) Last inbound helper view
-- ============================================================================
create or replace view public.v_thread_last_inbound as
select
  t.id as thread_id,
  li.last_inbound_id,
  li.last_inbound_label,
  li.last_inbound_at,
  li.last_inbound_label as last_label,
  li.last_inbound_at as last_inbound_at_real
from public.inbox_threads t
left join lateral (
  select
    nm.id as last_inbound_id,
    nm.ai_label as last_inbound_label,
    nm.sent_at as last_inbound_at
  from public.normalized_messages nm
  where nm.linked_thread_id = t.id
    and nm.direction = 'inbound'
  order by nm.sent_at desc
  limit 1
) li on true;

alter view public.v_thread_last_inbound
  set (security_invoker = on);

-- ============================================================================
-- D) Eligibility view
-- ============================================================================
create or replace view public.v_followup_eligible as
with nudges as (
  select thread_id, max(nudge_index) as max_idx
  from public.followup_tasks
  group by thread_id
)
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  l.name as lead_name,
  l.company as lead_company,
  l.email as lead_email,
  li.last_inbound_id,
  li.last_inbound_label,
  li.last_inbound_at,
  coalesce(n.max_idx, 0) as nudges_already,
  fr.max_nudges,
  fr.hours_wait,
  fr.auto_send,
  fr.tone,
  fr.length,
  (now() - li.last_inbound_at) as since_inbound
from public.inbox_threads t
join public.leads l on l.id = t.lead_id
join public.v_thread_last_inbound li on li.thread_id = t.id
join public.followup_rules fr on fr.campaign_id = t.campaign_id
left join nudges n on n.thread_id = t.id
where
  li.last_inbound_at is not null
  and coalesce(li.last_inbound_label, '') = any(fr.labels)
  and (t.snoozed_until is null or t.snoozed_until <= now())
  and (t.needs_reply = true or coalesce(t.last_outbound_at, to_timestamp(0)) < coalesce(li.last_inbound_at, now()))
  and li.last_inbound_at <= (now() - make_interval(hours => fr.hours_wait))
  and coalesce(n.max_idx, 0) < fr.max_nudges;

alter view public.v_followup_eligible
  set (security_invoker = on);

-- ============================================================================
-- E) Idempotent RPC to create a follow-up task
-- ============================================================================
create or replace function public.create_followup_task(p_thread uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_next int;
  v_id uuid;
begin
  select
    e.thread_id,
    e.campaign_id,
    e.lead_id,
    e.last_inbound_id,
    coalesce(e.nudges_already, 0) + 1 as next_nudge
  into v
  from public.v_followup_eligible e
  where e.thread_id = p_thread
  limit 1;

  if not found then
    raise exception 'Thread not eligible';
  end if;

  v_next := v.next_nudge;

  insert into public.followup_tasks (
    campaign_id,
    thread_id,
    lead_id,
    source_message_id,
    nudge_index,
    status
  )
  values (
    v.campaign_id,
    v.thread_id,
    v.lead_id,
    v.last_inbound_id,
    v_next,
    'queued'
  )
  on conflict (thread_id, nudge_index) do update
    set status = excluded.status
  returning id into v_id;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'nudge_no'
  ) then
    update public.followup_tasks
       set nudge_no = v_next
     where id = v_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'nudge_num'
  ) then
    update public.followup_tasks
       set nudge_num = v_next
     where id = v_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'last_inbound_id'
  ) then
    update public.followup_tasks
       set last_inbound_id = v.last_inbound_id
     where id = v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_followup_task(uuid) to authenticated;


