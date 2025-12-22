-- Queue resilience: lease, due time, backoff, error codes

alter table public.send_queue
  add column if not exists scheduled_at timestamptz,
  add column if not exists send_after timestamptz,          -- next eligible attempt time
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid,
  add column if not exists reason text,
  add column if not exists error_code text;                 -- e.g., rate_limited, smtp_550, network

create index if not exists send_queue_due_idx
  on public.send_queue (status, send_after nulls first, scheduled_at nulls first, created_at);

-- Optional: per-sender caps (default Gmail safe cap ~400/day for warm inboxes)
alter table public.sender_accounts
  add column if not exists daily_cap int not null default 400;

-- The lease_send_jobs RPC (atomic leasing)
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
    select id
    from public.send_queue
    where sender_account_id = any(p_sender_ids)
      and status in ('queued','scheduled')
      and coalesce(send_after, scheduled_at, p_now) <= p_now
      and (locked_at is null or locked_at < (p_now - make_interval(secs => p_lease_secs)))
    order by coalesce(send_after, scheduled_at, p_now) asc, created_at asc
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


