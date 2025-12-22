-- Cancels queued/sending items and logs the action.

create or replace function public.cancel_queue(p_ids uuid[])
returns jsonb
language plpgsql
security definer
as $$
declare
  v_canceled_ids uuid[];
  v_skipped_ids uuid[];
begin
  with target as (
    select id, campaign_id, lead_id, status
    from public.send_queue
    where id = any (p_ids)
    for update
  ),
  do_updates as (
    update public.send_queue sq
       set status = 'canceled',
           updated_at = now(),
           last_error = null
      from target t
     where sq.id = t.id
       and t.status in ('queued','sending')
    returning sq.id, sq.campaign_id, sq.lead_id
  )
  insert into public.campaign_logs (campaign_id, lead_id, event, meta, created_at)
  select du.campaign_id, du.lead_id, 'cancelled', jsonb_build_object('queue_id', du.id), now()
  from do_updates du;

  select coalesce(array_agg(id), '{}') into v_canceled_ids
  from public.send_queue where id = any (p_ids) and status = 'canceled';

  select coalesce(array_agg(id), '{}') into v_skipped_ids
  from public.send_queue
  where id = any (p_ids)
    and status not in ('queued','sending');

  return jsonb_build_object(
    'canceled_ids', v_canceled_ids,
    'skipped_ids', v_skipped_ids
  );
end;
$$;


