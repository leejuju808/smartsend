-- Auto-nudge follow-up pipeline (idempotent)
-- Ensures rules, tasks, drafts, candidate view, and planning RPC exist with
-- the expected structure used by the auto-nudge edge function.

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
  subject_template text default 'Quick follow-up for {{company}}',
  body_template text default 'Hi {{first_name}},\n\nFollowing up on my note re: {{company}}. If helpful, here’s a quick way we can help: {{offer}}.\n\nBest,\n{{sender_name}}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.followup_rules
  add column if not exists subject_template text,
  add column if not exists body_template text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.followup_rules
   set subject_template = coalesce(subject_template, 'Quick follow-up for {{company}}'),
       body_template = coalesce(body_template, 'Hi {{first_name}},\n\nFollowing up on my note re: {{company}}. If helpful, here’s a quick way we can help: {{offer}}.\n\nBest,\n{{sender_name}}')
 where subject_template is null
    or body_template is null;

alter table public.followup_rules
  alter column labels set default '{human_reply,question,positive,neutral}',
  alter column hours_wait set default 48,
  alter column max_nudges set default 2,
  alter column auto_send set default false,
  alter column tone set default 'professional',
  alter column subject_template set default 'Quick follow-up for {{company}}',
  alter column body_template set default 'Hi {{first_name}},\n\nFollowing up on my note re: {{company}}. If helpful, here’s a quick way we can help: {{offer}}.\n\nBest,\n{{sender_name}}',
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.followup_rules
  alter column subject_template set not null,
  alter column body_template set not null;

create or replace function public.touch_followup_rules()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_followup_rules on public.followup_rules;

create trigger trg_touch_followup_rules
before update on public.followup_rules
for each row
execute procedure public.touch_followup_rules();

-- ============================================================================
-- B) Follow-up task ledger
-- ============================================================================
create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  nudge_num int not null,
  due_at timestamptz not null,
  status text not null default 'new' check (status in ('new','drafted','sent','canceled','failed')),
  reason text,
  draft_subject text,
  draft_body text,
  auto_send boolean not null default false
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'nudge_no'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'nudge_num'
  ) then
    alter table public.followup_tasks rename column nudge_no to nudge_num;
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
      and column_name = 'run_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'followup_tasks'
      and column_name = 'due_at'
  ) then
    alter table public.followup_tasks rename column run_at to due_at;
  end if;
exception when undefined_column then
  null;
end;
$$;

alter table public.followup_tasks
  add column if not exists nudge_num int,
  add column if not exists due_at timestamptz,
  add column if not exists reason text,
  add column if not exists draft_subject text,
  add column if not exists draft_body text,
  add column if not exists auto_send boolean not null default false;

update public.followup_tasks
   set status = 'new'
 where status in ('pending','queued','processing');

update public.followup_tasks
   set status = 'canceled'
 where status in ('skipped');

update public.followup_tasks
   set status = 'failed'
 where status in ('error','dead');

alter table public.followup_tasks
  alter column nudge_num set not null,
  alter column due_at set not null,
  alter column status set default 'new';

alter table public.followup_tasks
  drop constraint if exists followup_tasks_status_check;

alter table public.followup_tasks
  add constraint followup_tasks_status_check
    check (status in ('new','drafted','sent','canceled','failed'));

create index if not exists idx_futasks_campaign_status on public.followup_tasks(campaign_id, status, due_at);
create index if not exists idx_futasks_due on public.followup_tasks(status, due_at);

create unique index if not exists uq_followup_thread_nudge on public.followup_tasks(thread_id, nudge_num);

-- ============================================================================
-- C) Outbox drafts created by the auto-nudge worker
-- ============================================================================
create table if not exists public.outbox_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  subject text not null,
  body text not null,
  source text not null default 'auto_nudge' check (source in ('auto_nudge','manual')),
  status text not null default 'draft' check (status in ('draft','queued','sent','canceled')),
  send_after timestamptz
);

create index if not exists idx_drafts_campaign_status on public.outbox_drafts(campaign_id, status, created_at);

alter table public.outbox_drafts enable row level security;

drop policy if exists "outbox_drafts_read" on public.outbox_drafts;
create policy "outbox_drafts_read" on public.outbox_drafts
  for select to authenticated
  using (exists (
    select 1
      from public.campaign_members m
     where m.campaign_id = outbox_drafts.campaign_id
       and m.user_id = auth.uid()
  ));

drop policy if exists "outbox_drafts_block_write" on public.outbox_drafts;
create policy "outbox_drafts_block_write" on public.outbox_drafts
  for all to authenticated
  using (false)
  with check (false);

-- ============================================================================
-- D) Candidate view
-- ============================================================================
drop view if exists public.v_followup_candidates cascade;

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
    ), 0) as already_nudged
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
  and now() >= (b.last_inbound_at + make_interval(hours => b.hours_wait));

alter view public.v_followup_candidates set (security_invoker = on);

-- ============================================================================
-- E) Planning RPC
-- ============================================================================
drop function if exists public.plan_followups(int);

create or replace function public.plan_followups(p_limit int default 100)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  inserted int := 0;
begin
  for rec in
    select *
      from public.v_followup_candidates
     order by due_at asc
     limit coalesce(p_limit, 100)
  loop
    begin
      insert into public.followup_tasks (
        campaign_id,
        thread_id,
        lead_id,
        nudge_num,
        due_at,
        status,
        reason,
        auto_send
      )
      values (
        rec.campaign_id,
        rec.thread_id,
        rec.lead_id,
        rec.next_nudge_num,
        rec.due_at,
        'new',
        'hours_wait',
        rec.auto_send
      );
      inserted := inserted + 1;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  return inserted;
end;
$$;

grant execute on function public.plan_followups(int) to authenticated;

-- ============================================================================
-- F) RLS adjustments
-- ============================================================================
alter table public.followup_tasks enable row level security;

drop policy if exists "fut_read" on public.followup_tasks;
create policy "fut_read" on public.followup_tasks
  for select to authenticated
  using (exists (
    select 1
      from public.campaign_members m
     where m.campaign_id = followup_tasks.campaign_id
       and m.user_id = auth.uid()
  ));

drop policy if exists "fut_write" on public.followup_tasks;
create policy "fut_write" on public.followup_tasks
  for update to authenticated
  using (false)
  with check (false);

drop policy if exists "fut_insert" on public.followup_tasks;
create policy "fut_insert" on public.followup_tasks
  for insert to authenticated
  with check (false);


