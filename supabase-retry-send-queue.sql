-- Ensure required columns exist

alter table public.send_queue
  add column if not exists max_attempts int not null default 3,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists send_queue_status_idx on public.send_queue (status);
create index if not exists send_queue_campaign_idx on public.send_queue (campaign_id);

-- Retry RPC: only moves FAILED rows with attempt < max_attempts back to QUEUED
create or replace function public.retry_failed_jobs(p_ids uuid[])
returns table(id uuid, status text, attempt int, message text)
language plpgsql
security definer
as $$
begin
  -- Re-enqueue eligible rows
  update public.send_queue sq
     set status = 'queued',
         attempt = sq.attempt + 1,
         scheduled_at = now(),
         updated_at = now(),
         last_error = null
   where sq.id = any (p_ids)
     and sq.status = 'failed'
     and sq.attempt < sq.max_attempts
  returning sq.id, sq.status, sq.attempt, 'requeued'::text as message;

  -- Return ineligible rows as info (attempt guard or wrong status)
  return query
  select sq.id,
         sq.status,
         sq.attempt,
         case
           when sq.status <> 'failed' then 'skipped: not failed'
           when sq.attempt >= sq.max_attempts then 'skipped: at max attempts'
           else 'skipped'
         end as message
  from public.send_queue sq
  where sq.id = any (p_ids)
    and not (sq.status='failed' and sq.attempt < sq.max_attempts);
end;
$$;

grant execute on function public.retry_failed_jobs(uuid[]) to authenticated, service_role;

-- Optional: log each retry for your timeline
create or replace function public.log_retries_from_queue(p_ids uuid[])
returns void
language plpgsql
security definer
as $$
begin
  insert into public.campaign_logs (campaign_id, lead_id, event_type, last_error, details)
  select sq.campaign_id,
         sq.lead_id,
         'retry_requested',
         null,
         jsonb_build_object('queue_id', sq.id, 'attempt', sq.attempt + 1)
  from public.send_queue sq
  where sq.id = any (p_ids);
end;
$$;

grant execute on function public.log_retries_from_queue(uuid[]) to authenticated, service_role;


