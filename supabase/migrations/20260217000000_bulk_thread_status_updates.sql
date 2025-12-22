-- Bulk Thread Status Updates with Permission Gating
-- Enables batch status updates with per-thread permission checks

create or replace function public.bulk_update_thread_status(
  p_threads uuid[],
  p_status text,
  p_snooze_until timestamptz default null
) returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count int := 0;
  r record;
begin
  if p_status not in ('open','replied','archived','snoozed') then
    raise exception 'invalid status';
  end if;

  for r in
    select id, campaign_id from public.lead_threads
    where id = any(p_threads)
  loop
    if not can_edit_campaign(r.campaign_id) then
      continue; -- silently skip unauthorized threads
    end if;

    update public.lead_threads
       set status = p_status,
           snooze_until = case when p_status = 'snoozed' then p_snooze_until else null end,
           updated_at = now()
     where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.bulk_update_thread_status(uuid[], text, timestamptz) from public;
grant execute on function public.bulk_update_thread_status(uuid[], text, timestamptz) to authenticated;

