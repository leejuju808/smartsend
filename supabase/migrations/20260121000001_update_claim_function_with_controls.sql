-- Update claim_due_queue to respect pause, cancel, and priority
create or replace function public.claim_due_queue(max_rows int)
returns setof public.send_queue
language plpgsql
security definer
as $$
begin
  return query
  with c as (
    select sq.id
    from public.send_queue sq
    join public.campaigns c on c.id = sq.campaign_id
    where
      sq.status in ('queued','sending') and
      sq.canceled_at is null and  -- not canceled
      c.status <> 'paused' and    -- campaign not paused
      coalesce(sq.next_attempt_at, sq.scheduled_at) <= now() and
      -- don't re-grab rows already "sending" that aren't due
      (sq.status = 'queued' or (sq.status='sending' and sq.next_attempt_at <= now()))
    order by sq.priority desc, coalesce(sq.next_attempt_at, sq.scheduled_at) asc
    for update skip locked
    limit max_rows
  )
  update public.send_queue s
  set status = 'sending',
      attempts = s.attempts + 1
  from c
  where s.id = c.id
  returning s.*;
end;
$$;

-- Ensure RLS still protects rows via existing policies
revoke all on function public.claim_due_queue(int) from public;
grant execute on function public.claim_due_queue(int) to anon, authenticated, service_role;

