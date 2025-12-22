-- Sender-Throttled Queue Claiming
-- Updates claim_due_queue to respect sender daily limits

-- Replace claim_due_queue with sender-aware version
create or replace function public.claim_due_queue(max_rows int)
returns setof public.send_queue
language plpgsql
security definer
as $$
begin
  return query
  with sender_quotas as (
    -- Calculate remaining quota per sender
    select 
      sp.id as sender_id,
      sp.daily_limit,
      coalesce(count(sq.id) filter (where sq.status = 'sent' and sq.sent_at >= date_trunc('day', now())), 0) as sent_today,
      greatest(0, sp.daily_limit - coalesce(count(sq.id) filter (where sq.status = 'sent' and sq.sent_at >= date_trunc('day', now())), 0)) as remaining
    from public.sender_profiles sp
    left join public.send_queue sq on sq.sender_id = sp.id
    group by sp.id, sp.daily_limit
    having greatest(0, sp.daily_limit - coalesce(count(sq.id) filter (where sq.status = 'sent' and sq.sent_at >= date_trunc('day', now())), 0)) > 0
  ),
  eligible_items as (
    -- Get queued items with remaining quota
    select 
      sq.*,
      row_number() over (partition by sq.sender_id order by sq.scheduled_at asc) as rn,
      sq2.remaining
    from public.send_queue sq
    inner join sender_quotas sq2 on sq.sender_id = sq2.sender_id
    where sq.status = 'queued'
      and sq.scheduled_at <= now()
    for update skip locked
  ),
  selected_items as (
    -- Pick items within quota limits
    select ei.*
    from eligible_items ei
    where ei.rn <= ei.remaining
    order by ei.scheduled_at asc
    limit max_rows
  ),
  fallback_items as (
    -- Fallback: items without sender_id (legacy)
    select sq.*
    from public.send_queue sq
    where sq.status = 'queued'
      and sq.scheduled_at <= now()
      and sq.sender_id is null
      and not exists (select 1 from selected_items si where si.id = sq.id)
    order by sq.scheduled_at asc
    limit greatest(0, max_rows - (select count(*) from selected_items))
    for update skip locked
  ),
  all_items as (
    select * from selected_items
    union all
    select * from fallback_items
    limit max_rows
  )
  update public.send_queue s
  set status = 'sending',
      attempts = s.attempts + 1,
      updated_at = now()
  from all_items ai
  where s.id = ai.id
  returning s.*;
end;
$$;

-- Grant execute permission
revoke all on function public.claim_due_queue(int) from public;
grant execute on function public.claim_due_queue(int) to anon, authenticated, service_role;

