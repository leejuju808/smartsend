-- Inbox follow-up tasks, SLA helpers, and views (idempotent)

-- A) Follow-up tasks (per thread)
create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  assignee_user_id uuid references auth.users(id) on delete set null,
  title text not null default 'Reply follow-up',
  status text not null check (status in ('open','done','snoozed')) default 'open',
  due_at timestamptz,
  snooze_until timestamptz,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_tasks_owner_status_due on public.followup_tasks(owner_user_id, status, due_at);
create index if not exists idx_tasks_thread on public.followup_tasks(thread_id);


-- B) SLA policy table (simple per-label)
create table if not exists public.sla_policies (
  id text primary key,
  target_minutes int not null
);

insert into public.sla_policies(id, target_minutes) values
  ('reply-positive', 120),
  ('reply-neutral', 480)
on conflict (id) do update set target_minutes = excluded.target_minutes;


-- C) Compute SLA due from label + last activity
create or replace function public.sla_due_for(label text, base_ts timestamptz)
returns timestamptz
language sql stable as $$
  select case
           when label is null then null
           when exists (select 1 from public.sla_policies p where p.id = label)
             then base_ts + ((select target_minutes from public.sla_policies where id = label)) * interval '1 minute'
           else null
         end;
$$;


-- D) View: last inbound + label per thread (for badges)
create or replace view public.v_thread_last_inbound as
select
  t.id as thread_id,
  max(m.created_at) as last_inbound_at,
  (array_agg(m.ai_label order by m.created_at desc))[1] as last_ai_label
from public.inbox_threads t
left join public.inbox_messages m on m.thread_id = t.id and m.direction = 'inbound'
group by t.id;


-- E) Inbox overview with SLA/aging info
create or replace view public.v_inbox_with_sla as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  t.provider,
  t.provider_thread_id,
  t.pinned,
  t.handled,
  t.updated_at,
  l.email as lead_email,
  vli.last_inbound_at,
  vli.last_ai_label,
  public.sla_due_for(vli.last_ai_label, coalesce(vli.last_inbound_at, t.updated_at)) as sla_due_at,
  greatest(extract(epoch from (now() - coalesce(vli.last_inbound_at, t.updated_at)))::bigint, 0) as age_seconds
from public.inbox_threads t
left join public.leads l on l.id = t.lead_id
left join public.v_thread_last_inbound vli on vli.thread_id = t.id;


-- F) RPC: upsert an 'open' follow-up for a thread (service role)
create or replace function public.ensure_followup_task(
  p_thread uuid,
  p_owner uuid,
  p_assignee uuid default null,
  p_title text default 'Reply follow-up',
  p_due timestamptz default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_task uuid;
  v_campaign uuid;
  v_lead uuid;
begin
  select campaign_id, lead_id into v_campaign, v_lead from public.inbox_threads where id = p_thread;
  if v_campaign is null then raise exception 'thread not found'; end if;

  -- if an open task exists, keep it
  select id into v_task from public.followup_tasks
   where thread_id = p_thread and status in ('open','snoozed')
   order by created_at desc limit 1;

  if v_task is null then
    insert into public.followup_tasks(thread_id, campaign_id, lead_id, owner_user_id, assignee_user_id, title, status, due_at)
    values (p_thread, v_campaign, v_lead, p_owner, p_assignee, coalesce(p_title, 'Reply follow-up'), 'open', p_due)
    returning id into v_task;
  else
    update public.followup_tasks set due_at = coalesce(p_due, due_at) where id = v_task;
  end if;

  return v_task;
end;
$$;

revoke all on function public.ensure_followup_task(uuid, uuid, uuid, text, timestamptz) from anon, authenticated;











