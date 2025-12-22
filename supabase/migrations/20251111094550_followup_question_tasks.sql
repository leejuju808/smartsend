-- Follow-up tasks table and helpers for clarify questions

-- A) Lightweight follow-up tasks
create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  due_at timestamptz,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  kind text not null,
  status text not null default 'open',
  assignee uuid references auth.users(id) on delete set null,
  suggested_reply text,
  note text
);

create index if not exists idx_followup_tasks_thread on public.followup_tasks(thread_id);
create index if not exists idx_followup_tasks_status on public.followup_tasks(status);


-- B) Helper: ensure single 'clarify' task per thread
create or replace function public.ensure_question_task(p_thread uuid, p_campaign uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.followup_tasks
  where thread_id = p_thread
    and kind = 'clarify'
    and status = 'open'
  limit 1;

  if v_id is null then
    insert into public.followup_tasks (campaign_id, thread_id, kind, status, note)
    values (p_campaign, p_thread, 'clarify', 'open', 'auto-created on question')
    returning id into v_id;
  end if;

  return v_id;
end;
$$;


-- C) Trigger: on reply_type → 'question' create/open task
create or replace function public.route_on_question()
returns trigger
language plpgsql
as $$
begin
  if new.reply_type = 'question' and coalesce(old.reply_type, '') <> 'question' then
    perform public.ensure_question_task(new.id, new.campaign_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_route_on_question on public.inbox_threads;
create trigger trg_route_on_question
after update of reply_type on public.inbox_threads
for each row
execute function public.route_on_question();


-- D) Context helpers
create or replace function public.latest_inbound_text(p_thread uuid)
returns text
language sql
stable
as $$
  select im.text_body
  from public.inbox_messages im
  where im.thread_id = p_thread
    and im.direction = 'inbound'
    and coalesce(nullif(trim(im.text_body), ''), '') <> ''
  order by im.created_at desc
  limit 1
$$;

create or replace view public.v_thread_context as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  l.first_name,
  l.last_name,
  l.company,
  l.email,
  public.latest_inbound_text(t.id) as inbound_text,
  mp.duration_min,
  mp.tz,
  mp.workdays,
  mp.start_hour,
  mp.end_hour
from public.inbox_threads t
left join public.leads l on l.id = t.lead_id
left join public.meeting_prefs mp on mp.campaign_id = t.campaign_id;







