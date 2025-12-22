-- 002_retry_failed_queue.sql
-- Table assumptions:
--   public.send_queue(id uuid pk, campaign_id uuid, lead_id uuid, status text, attempt_count int, max_attempts int, last_error text, updated_at timestamptz)
--   public.campaign_logs(id uuid pk, campaign_id uuid, lead_id uuid, event text, meta jsonb, created_at timestamptz)
-- Status values: 'queued' | 'sending' | 'sent' | 'failed' | 'canceled'

create or replace function public.retry_failed_queue(p_ids uuid[])
returns jsonb
language plpgsql
security definer
as $$
declare
  v_updated_ids uuid[];
  v_skipped_ids uuid[];
begin
  -- Lock the target rows to avoid race with other retries
  with target as (
    select id, campaign_id, lead_id, attempt_count, max_attempts, status
    from public.send_queue
    where id = any (p_ids)
    for update
  ),
  do_updates as (
    update public.send_queue sq
       set status = 'queued',
           attempt_count = sq.attempt_count + 1,
           updated_at = now(),
           last_error = null
      from target t
     where sq.id = t.id
       and t.status = 'failed'
       and t.attempt_count < t.max_attempts
    returning sq.id, sq.campaign_id, sq.lead_id
  )
  insert into public.campaign_logs (campaign_id, lead_id, event, meta, created_at)
  select du.campaign_id, du.lead_id, 'retry_enqueued', jsonb_build_object('queue_id', du.id), now()
  from do_updates du;

  select coalesce(array_agg(id), '{}') into v_updated_ids from public.send_queue where id = any (p_ids) and status = 'queued';

  -- Skipped = not updated because either not failed or already at/over max_attempts
  select coalesce(array_agg(t.id), '{}') into v_skipped_ids
  from (
    select id
    from public.send_queue
    where id = any (p_ids)
      and (status <> 'failed' or attempt_count >= max_attempts)
  ) t;

  return jsonb_build_object(
    'updated_ids', v_updated_ids,
    'skipped_ids', v_skipped_ids
  );
end;
$$;

-- Optional: grant execute to anon/authenticated roles if you will call with user client.
-- If you call from server with service role, this is not required.


