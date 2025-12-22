-- Follow-up automation schema refresh
-- Run in Supabase SQL editor or via `supabase db execute`

-- Clean up legacy helpers (safe if missing)
drop function if exists public.fu_process(uuid, int);
drop function if exists public.fu_enqueue_nudge(uuid, text, text, text);
drop function if exists public.fu_candidates(uuid);
drop view if exists public.v_thread_status;

-- A) Per-campaign follow-up policy
create table if not exists public.followup_rules (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  labels text[] not null default '{human_reply,question,positive,neutral}',
  hours_wait int not null default 48,
  max_nudges int not null default 2,
  auto_send boolean not null default false,
  tone text not null default 'professional',
  length text not null default 'short',
  cta text,
  enabled boolean not null default true
);

alter table public.followup_rules
  alter column labels set default '{human_reply,question,positive,neutral}';

alter table public.followup_rules
  alter column hours_wait set default 48;

alter table public.followup_rules
  alter column max_nudges set default 2;

alter table public.followup_rules
  alter column auto_send set default false;

alter table public.followup_rules
  alter column tone set default 'professional';

alter table public.followup_rules
  add column if not exists length text;

alter table public.followup_rules
  alter column length set default 'short';

alter table public.followup_rules
  add column if not exists cta text;

alter table public.followup_rules
  alter column enabled set default true;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_rules'
      and column_name = 'meta'
  ) then
    alter table public.followup_rules drop column meta;
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_rules'
      and column_name = 'subject_template'
  ) then
    alter table public.followup_rules drop column subject_template;
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_rules'
      and column_name = 'body_html_template'
  ) then
    alter table public.followup_rules drop column body_html_template;
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_rules'
      and column_name = 'tone'
  ) then
    update public.followup_rules
      set tone = coalesce(nullif(tone, ''), 'professional')
    where tone is null or tone = '';
    alter table public.followup_rules
      alter column tone set not null;
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_rules'
      and column_name = 'length'
  ) then
    update public.followup_rules
      set length = coalesce(nullif(length, ''), 'short')
    where length is null or length = '';
    alter table public.followup_rules
      alter column length set not null;
  end if;
end
$$;

-- B) Per-thread follow-up task queue
create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','working','done','failed','dead','skipped')),
  attempts int not null default 0,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  nudge_no int not null default 1,
  goal text not null default 'followup',
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  unique(thread_id, nudge_no)
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
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'followup_tasks'
        and column_name = 'run_at'
    ) then
      alter table public.followup_tasks rename column scheduled_at to run_at;
    else
      update public.followup_tasks
        set run_at = coalesce(run_at, scheduled_at);
      alter table public.followup_tasks drop column scheduled_at;
    end if;
  end if;
  if exists (
    select 1
    from pg_constraint
    where conname = 'followup_tasks_status_check'
      and conrelid = 'public.followup_tasks'::regclass
  ) then
    alter table public.followup_tasks drop constraint followup_tasks_status_check;
  end if;
end
$$;

alter table public.followup_tasks
  alter column run_at set default now();

alter table public.followup_tasks
  alter column run_at set not null;

alter table public.followup_tasks
  add column if not exists attempts int not null default 0;

alter table public.followup_tasks
  add column if not exists goal text not null default 'followup';

alter table public.followup_tasks
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.followup_tasks
  add column if not exists last_error text;

alter table public.followup_tasks
  alter column status set default 'queued';

alter table public.followup_tasks
  alter column nudge_no set default 1;

alter table public.followup_tasks
  alter column attempts set default 0;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'last_inbound_id'
  ) then
    alter table public.followup_tasks drop column last_inbound_id;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'reason'
  ) then
    alter table public.followup_tasks drop column reason;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'meta'
  ) then
    alter table public.followup_tasks drop column meta;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.followup_tasks'::regclass
      and contype = 'c'
      and conname = 'followup_tasks_status_check_v2'
  ) then
    alter table public.followup_tasks
      add constraint followup_tasks_status_check_v2
      check (status in ('queued','working','done','failed','dead','skipped'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.followup_tasks'::regclass
      and contype = 'u'
      and conname = 'followup_tasks_thread_nudge_key'
  ) then
    alter table public.followup_tasks
      add constraint followup_tasks_thread_nudge_key unique (thread_id, nudge_no);
  end if;
end
$$;

create index if not exists idx_fut_status_run on public.followup_tasks(status, run_at);
create index if not exists idx_fut_thread on public.followup_tasks(thread_id);

alter table public.followup_tasks enable row level security;

drop policy if exists followup_tasks_read on public.followup_tasks;
drop policy if exists followup_tasks_write on public.followup_tasks;
drop policy if exists "fut_ro" on public.followup_tasks;

create policy "fut_ro"
  on public.followup_tasks
  for select
  to authenticated
  using (false);

-- C) Last inbound per thread (+ label), for rule evaluation
create or replace view public.v_thread_last_inbound as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  max(nm.sent_at) as last_inbound_at,
  (array_agg(nm.ai_label order by nm.sent_at desc))[1] as last_label
from public.inbox_threads t
join public.normalized_messages nm
  on nm.linked_thread_id = t.id
  and nm.direction = 'inbound'
group by t.id, t.campaign_id, t.lead_id;

-- D) Count of previous nudges per thread
create or replace view public.v_thread_nudges as
select thread_id, count(*)::int as nudges
from public.followup_tasks
where status in ('done','queued','working','failed','skipped')
group by thread_id;

-- E) Enqueue helper (idempotent per (thread, nudge_no))
create or replace function public.enqueue_followup_task(
  p_campaign uuid,
  p_thread uuid,
  p_lead uuid,
  p_run_at timestamptz,
  p_nudge int,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.followup_tasks (campaign_id, thread_id, lead_id, run_at, nudge_no, payload)
  values (p_campaign, p_thread, p_lead, p_run_at, p_nudge, coalesce(p_payload, '{}'::jsonb))
  on conflict (thread_id, nudge_no) do nothing
  returning id into v_id;

  if v_id is null then
    select id
      into v_id
      from public.followup_tasks
     where campaign_id = p_campaign
       and thread_id = p_thread
       and nudge_no = p_nudge
     order by created_at asc
     limit 1;
  end if;
  return v_id;
end;
$$;

grant execute on function public.enqueue_followup_task(uuid,uuid,uuid,timestamptz,int,jsonb) to authenticated;

-- F) Auto-enqueue finder
create or replace function public.find_followup_candidates()
returns table(
  thread_id uuid,
  campaign_id uuid,
  lead_id uuid,
  nudge_no int,
  run_at timestamptz,
  payload jsonb
)
language sql
stable
as $$
  with base as (
    select
      t.id as thread_id,
      t.campaign_id,
      t.lead_id,
      v.last_inbound_at,
      v.last_label,
      coalesce(n.nudges, 0) as nudges_done,
      r.hours_wait,
      r.max_nudges,
      r.enabled,
      r.labels
    from public.inbox_threads t
    join public.v_thread_last_inbound v on v.thread_id = t.id
    join public.followup_rules r on r.campaign_id = t.campaign_id and r.enabled
    left join public.v_thread_nudges n on n.thread_id = t.id
    where t.needs_reply = true
      and v.last_label = any(r.labels)
      and now() >= v.last_inbound_at + (r.hours_wait || ' hours')::interval
      and coalesce(n.nudges, 0) < r.max_nudges
  )
  select
    thread_id,
    campaign_id,
    lead_id,
    nudges_done + 1 as nudge_no,
    now() as run_at,
    jsonb_build_object(
      'last_inbound_at', last_inbound_at,
      'last_label', last_label,
      'nudge_no', nudges_done + 1
    ) as payload
  from base;
$$;

-- G) Auto-clear needs_reply on outbound messages
create or replace function public.tg_clear_needs_reply_on_outbound()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.inbox_threads
     set needs_reply = false
   where id = NEW.thread_id;
  return NEW;
end;
$$;

drop trigger if exists trg_clear_needs_reply_on_im on public.inbox_messages;
create trigger trg_clear_needs_reply_on_im
after insert on public.inbox_messages
for each row
when (NEW.direction = 'outbound')
execute procedure public.tg_clear_needs_reply_on_outbound();

drop trigger if exists trg_clear_needs_reply_on_logs on public.send_logs;
create trigger trg_clear_needs_reply_on_logs
after insert on public.send_logs
for each row
execute procedure public.tg_clear_needs_reply_on_outbound();

