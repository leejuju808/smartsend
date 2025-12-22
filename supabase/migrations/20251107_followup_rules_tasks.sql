-- Follow-up rules and task scheduler support
-- Idempotent setup for follow-up automation

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_rules'
      and column_name = 'max'
  ) then
    alter table public.followup_rules rename column "max" to max_nudges;
  end if;
exception when undefined_table then
  -- table does not exist yet
end;
$$;

create table if not exists public.followup_rules (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  labels text[] not null default array['question','neutral'],
  hours_wait int not null default 48,
  max_nudges int not null default 2,
  auto_send boolean not null default false,
  tone text not null default 'warm',
  enabled boolean not null default true,
  meta jsonb not null default '{}'::jsonb
);

comment on column public.followup_rules.max_nudges is 'Maximum nudges before stopping follow-ups';

create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  scheduled_at timestamptz not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  last_inbound_id uuid not null references public.inbox_messages(id) on delete cascade,
  nudge_no int not null default 1 check (nudge_no >= 1),
  status text not null default 'queued' check (status in ('queued','running','done','skipped','canceled','failed')),
  reason text,
  meta jsonb not null default '{}'::jsonb,
  unique(thread_id, nudge_no)
);

create index if not exists idx_fu_tasks_sched on public.followup_tasks(scheduled_at, status);
create index if not exists idx_fu_tasks_thread on public.followup_tasks(thread_id);
create index if not exists idx_fu_tasks_campaign on public.followup_tasks(campaign_id);

create or replace view public.v_thread_status as
with last_in as (
  select
    m.thread_id,
    max(m.created_at) as last_in_at,
    (array_agg(m.id order by m.created_at desc))[1] as last_in_id,
    (array_agg(m.ai_label order by m.created_at desc))[1] as last_in_label,
    (array_agg(m.ai_score order by m.created_at desc))[1] as last_in_score
  from public.inbox_messages m
  where m.direction = 'inbound'
  group by m.thread_id
),
last_human_out as (
  select
    m.thread_id,
    max(m.created_at) as last_human_out_at
  from public.inbox_messages m
  where m.direction = 'outbound'
    and coalesce((m.meta->>'sent_by'), 'ai') <> 'ai'
  group by m.thread_id
)
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  li.last_in_at,
  li.last_in_id,
  li.last_in_label,
  li.last_in_score,
  lho.last_human_out_at
from public.inbox_threads t
left join last_in li on li.thread_id = t.id
left join last_human_out lho on lho.thread_id = t.id;

alter table public.followup_rules enable row level security;
alter table public.followup_tasks enable row level security;

drop policy if exists followup_rules_read on public.followup_rules;
create policy followup_rules_read on public.followup_rules
for select to authenticated
using (
  exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = followup_rules.campaign_id
      and cm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.campaigns c
    where c.id = followup_rules.campaign_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists followup_tasks_read on public.followup_tasks;
create policy followup_tasks_read on public.followup_tasks
for select to authenticated
using (
  exists (
    select 1
    from public.campaign_members cm
    join public.inbox_threads it on it.id = followup_tasks.thread_id
    where cm.campaign_id = it.campaign_id
      and cm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.campaigns c
    join public.inbox_threads it on it.id = followup_tasks.thread_id
    where c.id = it.campaign_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists followup_rules_write on public.followup_rules;
create policy followup_rules_write on public.followup_rules
for all to authenticated
using (false)
with check (false);

drop policy if exists followup_tasks_write on public.followup_tasks;
create policy followup_tasks_write on public.followup_tasks
for all to authenticated
using (false)
with check (false);

create or replace function public.cancel_followups_on_human_reply()
returns trigger
language plpgsql
as $$
begin
  if NEW.direction = 'outbound' and coalesce((NEW.meta->>'sent_by'), 'ai') <> 'ai' then
    update public.followup_tasks
      set status = 'canceled', reason = 'human_reply'
      where thread_id = NEW.thread_id and status in ('queued', 'running');
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_cancel_fu_on_human_reply on public.inbox_messages;
create trigger trg_cancel_fu_on_human_reply
after insert on public.inbox_messages
for each row execute function public.cancel_followups_on_human_reply();


