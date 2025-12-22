-- Update lease_send_jobs to skip paused campaigns and leads

create or replace function public.lease_send_jobs(
  p_lock_id uuid,
  p_limit int,
  p_now timestamptz,
  p_lease_secs int,
  p_sender_ids uuid[]
)
returns table (id uuid, lead_id uuid, campaign_id uuid, sender_account_id uuid, attempt int)
language plpgsql
security definer
as $$
begin
  return query
  with due as (
    select sq.id
    from public.send_queue sq
    join public.campaigns c on c.id = sq.campaign_id
    left join public.campaign_leads cl on cl.id = sq.lead_id
    where sq.sender_account_id = any(p_sender_ids)
      and sq.status in ('queued','scheduled')
      and coalesce(sq.send_after, sq.scheduled_at, p_now) <= p_now
      and (sq.locked_at is null or sq.locked_at < (p_now - make_interval(secs => p_lease_secs)))
      and c.is_paused = false                                    -- skip paused campaigns
      and (cl.paused_at is null)                                 -- skip paused leads
    order by coalesce(sq.send_after, sq.scheduled_at, p_now) asc, sq.created_at asc
    limit p_limit
    for update skip locked
  ),
  upd as (
    update public.send_queue sq
       set locked_at = p_now,
           locked_by = p_lock_id,
           status = 'sending'
     from due
     where sq.id = due.id
     returning sq.id, sq.lead_id, sq.campaign_id, sq.sender_account_id, sq.attempt
  )
  select * from upd;
end $$;

grant execute on function public.lease_send_jobs(uuid,int,timestamptz,int,uuid[]) to authenticated, anon;

