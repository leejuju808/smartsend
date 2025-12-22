-- Inbox Tasks, Templates, and Routing Helpers
-- Run in Supabase SQL (idempotent)

-- A) Inbox tasks table -------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'inbox_tasks'
  ) then
    create table public.inbox_tasks (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      thread_id uuid not null references public.inbox_threads(id) on delete cascade,
      message_id uuid references public.inbox_messages(id) on delete set null,
      campaign_id uuid references public.campaigns(id) on delete set null,
      lead_id uuid references public.leads(id) on delete set null,
      type text not null check (type in ('schedule','question','custom')),
      status text not null default 'open' check (status in ('open','done','dismissed')),
      title text not null,
      details text,
      due_at timestamptz
    );
  end if;
end $$;

-- Ensure new columns exist even if table predated this script
alter table public.inbox_tasks
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete cascade,
  add column if not exists message_id uuid references public.inbox_messages(id) on delete set null,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists type text,
  add column if not exists details text,
  add column if not exists due_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbox_tasks' and column_name = 'org_id' and is_nullable = 'NO'
  ) then
    alter table public.inbox_tasks alter column org_id drop not null;
  end if;
end $$;

update public.inbox_tasks
set type = coalesce(type, 'custom')
where type is null;

alter table public.inbox_tasks
  alter column type set default 'custom';

do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'inbox_tasks' and constraint_name = 'inbox_tasks_type_check'
  ) then
    alter table public.inbox_tasks drop constraint inbox_tasks_type_check;
  end if;
exception when undefined_object then
  null;
end $$;

alter table public.inbox_tasks
  add constraint inbox_tasks_type_check check (type in ('schedule','question','custom'));

alter table public.inbox_tasks
  alter column type set not null;

-- Refresh status constraint to allow dismissed
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.inbox_tasks'::regclass
      and conname = 'inbox_tasks_status_check'
  ) then
    alter table public.inbox_tasks drop constraint inbox_tasks_status_check;
  end if;
exception when undefined_object then
  null;
end $$;

alter table public.inbox_tasks
  alter column status set default 'open';

alter table public.inbox_tasks
  add constraint inbox_tasks_status_check
    check (status in ('open','done','dismissed'));

-- Normalize legacy statuses if present
update public.inbox_tasks
set status = 'dismissed'
where status = 'canceled';

-- Ensure details column mirrors legacy notes if needed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbox_tasks' and column_name = 'notes'
  ) then
    execute $$
      update public.inbox_tasks
      set details = coalesce(details, notes)
      where details is null
    $$;
  end if;
end $$;

-- Track updates automatically
create or replace function public.set_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_inbox_tasks_timestamps on public.inbox_tasks;
create trigger trg_inbox_tasks_timestamps
before update on public.inbox_tasks
for each row execute function public.set_timestamp();

create index if not exists idx_tasks_thread_status on public.inbox_tasks(thread_id, status);
create index if not exists idx_tasks_due on public.inbox_tasks(due_at);
create unique index if not exists idx_tasks_message_type_unique on public.inbox_tasks(message_id, type)
  where message_id is not null;

-- B) Reply templates table ----------------------------------------------------
create table if not exists public.reply_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  category text not null check (category in ('positive','question','negative','unsubscribe','intro','pricing','calendar')),
  subject text,
  body_html text not null,
  enabled boolean not null default true
);

create index if not exists idx_templates_category on public.reply_templates(category) where enabled;

-- C) Seed high-utility templates ---------------------------------------------
insert into public.reply_templates (name, category, subject, body_html)
select 'Calendar Hand-off', 'calendar', 'Quick time?', '<p>Great to connect! Here''s my calendar: {{CALENDAR_LINK}} -- pick any time that works. If easier, reply with a few windows.</p>'
where not exists (select 1 from public.reply_templates where name = 'Calendar Hand-off');

insert into public.reply_templates (name, category, subject, body_html)
select 'Pricing Primer', 'pricing', 'Pricing overview', '<p>Happy to share pricing. Most teams start at ${{START_PRICE}}/mo. Here''s a quick overview: {{PRICING_URL}}. Want me to recommend a tier based on your use case?</p>'
where not exists (select 1 from public.reply_templates where name = 'Pricing Primer');

-- D) Routing helper -----------------------------------------------------------
create or replace function public.route_task_for_label(
  p_thread uuid,
  p_message uuid,
  p_label text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_campaign uuid;
  v_lead uuid;
  v_title text;
  v_type text;
  v_due timestamptz;
begin
  select campaign_id, lead_id into v_campaign, v_lead
  from public.inbox_threads where id = p_thread;

  if p_label = 'positive' then
    v_type := 'schedule';
    v_title := 'Schedule call/demo';
    v_due := now() + interval '1 day';
  elsif p_label = 'question' then
    v_type := 'question';
    v_title := 'Answer prospect question';
    v_due := now() + interval '12 hours';
  else
    return;
  end if;

  insert into public.inbox_tasks(
    thread_id,
    message_id,
    campaign_id,
    lead_id,
    type,
    title,
    details,
    due_at
  )
  values (
    p_thread,
    p_message,
    v_campaign,
    v_lead,
    v_type,
    v_title,
    null,
    v_due
  )
  on conflict do nothing;
end;
$$;

-- E) Trigger after AI classify ------------------------------------------------
drop trigger if exists trg_route_on_classify on public.inbox_messages;

create or replace function public._route_on_classify()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.route_task_for_label(new.thread_id, new.id, new.ai_label);
  return new;
end;
$$;

create trigger trg_route_on_classify
after update of ai_label on public.inbox_messages
for each row
when (
  new.direction = 'inbound' and
  new.ai_label is not null and
  new.ai_label <> coalesce(old.ai_label, '')
)
execute function public._route_on_classify();

-- F) View of open tasks -------------------------------------------------------
create or replace view public.v_inbox_open_tasks as
select
  t.id as task_id,
  t.thread_id,
  t.type,
  t.status,
  t.title,
  t.due_at,
  t.campaign_id,
  t.lead_id
from public.inbox_tasks t
where t.status = 'open';

-- G) Row level security -------------------------------------------------------
alter table public.inbox_tasks enable row level security;

-- Drop legacy org-based policies if present
do $$
begin
  if exists (select 1 from pg_policies where policyname = 'read tasks in org' and tablename = 'inbox_tasks') then
    drop policy "read tasks in org" on public.inbox_tasks;
  end if;
  if exists (select 1 from pg_policies where policyname = 'write tasks in org' and tablename = 'inbox_tasks') then
    drop policy "write tasks in org" on public.inbox_tasks;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'tasks by campaign membership'
      and tablename = 'inbox_tasks'
  ) then
    create policy "tasks by campaign membership" on public.inbox_tasks
    for select using (
      exists (
        select 1 from public.inbox_threads it
        join public.campaign_members cm on cm.campaign_id = it.campaign_id and cm.user_id = auth.uid()
        where it.id = inbox_tasks.thread_id
      )
    );

    create policy "tasks update by campaign membership" on public.inbox_tasks
    for update using (
      exists (
        select 1 from public.inbox_threads it
        join public.campaign_members cm on cm.campaign_id = it.campaign_id and cm.user_id = auth.uid()
        where it.id = inbox_tasks.thread_id
      )
    );
  end if;
end $$;


