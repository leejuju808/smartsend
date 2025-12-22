-- Optional helper to atomically bump attempt and set queued status.
create or replace function public.retry_queue_atomic(
  _ids uuid[],
  _max_attempts int default 3
) returns table(id uuid, lead_id uuid, campaign_id uuid, attempt int, status text, blocked boolean)
language plpgsql
security definer
as $$
begin
  return query
  with selected as (
    select * from send_queue where id = any(_ids)
  ),
  updated as (
    update send_queue sq
    set attempt = sq.attempt + 1,
        status = 'queued',
        scheduled_at = now()
    from selected s
    where sq.id = s.id
      and coalesce(s.attempt,0) < _max_attempts
    returning sq.id, sq.lead_id, sq.campaign_id, sq.attempt, sq.status
  )
  select
    coalesce(u.id, s.id) as id,
    coalesce(u.lead_id, s.lead_id) as lead_id,
    coalesce(u.campaign_id, s.campaign_id) as campaign_id,
    coalesce(u.attempt, s.attempt) as attempt,
    coalesce(u.status, s.status) as status,
    case when u.id is null then true else false end as blocked
  from selected s
  left join updated u on u.id = s.id;
end;
$$;

-- Optional limited RPC wrapper (exposed to service role only or restricted via RLS).
revoke all on function public.retry_queue_atomic(uuid[], int) from public;

