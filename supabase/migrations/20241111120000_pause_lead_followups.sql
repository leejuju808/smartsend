create or replace function public.pause_lead_followups(p_thread_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_lead_id uuid;
begin
  select lead_id into v_lead_id from inbox_threads where id = p_thread_id;
  if v_lead_id is not null then
    update followup_tasks
    set paused = true, paused_at = now()
    where lead_id = v_lead_id and done = false;
  end if;
end;
$$;





