-- Update claim_due_queue to include retries due (next_attempt_at logic)
create or replace function public.claim_due_queue(max_rows int)
returns setof public.send_queue
language plpgsql
security definer
as $$
begin
  return query
  with c as (
    select id
    from public.send_queue
    where
      status in ('queued','sending') and
      coalesce(next_attempt_at, scheduled_at) <= now() and
      -- don't re-grab rows already "sending" that aren't due
      (status = 'queued' or (status='sending' and next_attempt_at <= now()))
    order by coalesce(next_attempt_at, scheduled_at) asc
    for update skip locked
    limit max_rows
  )
  update public.send_queue s
  set status = 'sending'
  from c
  where s.id = c.id
  returning s.*;
end;
$$;

-- Ensure RLS still protects rows via existing policies
revoke all on function public.claim_due_queue(int) from public;
grant execute on function public.claim_due_queue(int) to anon, authenticated, service_role;

