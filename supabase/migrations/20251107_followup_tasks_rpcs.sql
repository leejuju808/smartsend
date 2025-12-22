-- Follow-up task lifecycle helpers

alter table public.followup_tasks
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_fu_tasks_status_thread on public.followup_tasks(status, thread_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_fu_tasks_updated_at on public.followup_tasks;
create trigger trg_fu_tasks_updated_at
before update on public.followup_tasks
for each row execute function public.set_updated_at();

create or replace function public.rpc_claim_followup_task(p_task_id uuid)
returns public.followup_tasks
language sql
security definer
set search_path = public
as $$
  update public.followup_tasks
     set status = 'running'
   where id = p_task_id
     and status = 'queued'
  returning *;
$$;

create or replace function public.rpc_finalize_followup_task(
  p_task_id uuid,
  p_status text,
  p_reason text default null
)
returns public.followup_tasks
language sql
security definer
set search_path = public
as $$
  update public.followup_tasks
     set status = p_status,
         reason = coalesce(p_reason, reason)
   where id = p_task_id
  returning *;
$$;

create or replace function public.rpc_cancel_other_thread_followups(p_thread_id uuid, p_exclude_task uuid)
returns int
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.followup_tasks
       set status = 'canceled',
           reason = 'sent_elsewhere'
     where thread_id = p_thread_id
       and id <> p_exclude_task
       and status in ('queued','running')
    returning 1
  )
  select count(*)::int from upd;
$$;




