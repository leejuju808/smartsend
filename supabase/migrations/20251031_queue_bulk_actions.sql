-- Cap attempts

alter table public.send_queue
  add column if not exists max_attempts int not null default 3;

-- Add locked_at if it doesn't exist
alter table public.send_queue
  add column if not exists locked_at timestamptz;

-- Retry selected: clear lock/error and re-queue (respect attempt cap)
create or replace function public.retry_queue(p_ids uuid[])
returns void
language sql
security definer
as $$
  update public.send_queue
     set status = 'queued',
         locked_at = null,
         last_error = null,
         -- If scheduled in the future keep it; if in the past, allow immediate send.
         scheduled_at = least(scheduled_at, now())
   where id = any(p_ids) and attempt < max_attempts;
$$;

-- Cancel selected: stop future sends for these queue rows
create or replace function public.cancel_queue(p_ids uuid[])
returns void
language sql
security definer
as $$
  update public.send_queue
     set status = 'cancelled',
         locked_at = null
   where id = any(p_ids) and status in ('queued','sending');
$$;

grant execute on function public.retry_queue(uuid[]) to authenticated;
grant execute on function public.cancel_queue(uuid[]) to authenticated;

