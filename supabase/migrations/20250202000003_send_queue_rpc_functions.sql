-- RPC functions for send queue processing

-- claim_send_jobs: prefer fair per-user concurrency; SKIP LOCKED pattern
create or replace function claim_send_jobs(p_total int, p_per_user int)
returns table (
  id uuid, 
  user_id uuid, 
  to_email text, 
  subject text, 
  html text, 
  text text, 
  thread_id text, 
  campaign_id uuid, 
  lead_id uuid, 
  attempt_count int
)
language plpgsql 
security definer
as $$
begin
  return query
  with candidates as (
    select id, row_number() over (partition by user_id order by next_attempt_at asc) as rn
    from send_queue
    where status in ('queued','retrying')
      and next_attempt_at <= now()
    order by next_attempt_at asc
    limit p_total * 5
    for update skip locked
  ),
  eligible as (
    select id
    from candidates
    where rn <= p_per_user
    limit p_total
  )
  update send_queue q
     set status='processing', updated_at=now()
  from eligible
  where q.id = eligible.id
  returning q.id, q.user_id, q.to_email, q.subject, q.html, q.text, q.thread_id, q.campaign_id, q.lead_id, q.attempt_count;
end;
$$;

-- ensure_quota_row: ensure quota row exists for user
create or replace function ensure_quota_row(
  p_user_id uuid, 
  p_day_start timestamptz, 
  p_minute_start timestamptz
)
returns void 
language plpgsql 
security definer
as $$
begin
  insert into send_quotas(user_id, window_starts_at, minute_starts_at)
  values (p_user_id, p_day_start, p_minute_start)
  on conflict (user_id) do nothing;
end;
$$;

