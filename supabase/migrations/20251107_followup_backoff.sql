-- Follow-up backoff enhancements

alter table public.followup_tasks
  add column if not exists attempts int not null default 0,
  add column if not exists last_error text;

create or replace function public.rpc_finalize_followup_task(
  p_task_id uuid,
  p_status text,
  p_reason text default null,
  p_last_error text default null
)
returns public.followup_tasks
language sql
security definer
set search_path = public
as $$
  update public.followup_tasks
     set status = p_status,
         reason = coalesce(p_reason, reason),
         last_error = p_last_error
   where id = p_task_id
  returning *;
$$;

create or replace function public.rpc_reschedule_followup_task(
  p_task_id uuid,
  p_delay_seconds int,
  p_reason text default 'rate_limited'
)
returns public.followup_tasks
language sql
security definer
set search_path = public
as $$
  update public.followup_tasks
     set status = 'queued',
         attempts = attempts + 1,
         reason = p_reason,
         scheduled_at = now() + make_interval(secs => greatest(p_delay_seconds, 60))
   where id = p_task_id
  returning *;
$$;

create or replace function public.rpc_backoff_from_tokens(
  p_tokens_left numeric,
  p_refill_per_sec numeric default 0.025,
  p_min_sec int default 300,
  p_max_sec int default 1800
)
returns int
language plpgsql
as $$
declare
  need numeric := greatest(1 - p_tokens_left, 0);
  secs numeric := ceil(need / greatest(p_refill_per_sec, 0.0001));
begin
  return least(greatest(secs::int, p_min_sec), p_max_sec);
end;
$$;

