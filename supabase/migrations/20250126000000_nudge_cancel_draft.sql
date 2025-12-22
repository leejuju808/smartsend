-- Nudge cancel draft RPC and supporting index
set check_function_bodies = off;

create or replace function public.nudge_cancel_draft(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue_id uuid;
begin
  select q.id
    into v_queue_id
  from public.send_queue q
  where q.thread_id = p_thread_id
    and q.status = 'draft'
    and coalesce(q.meta->>'source', '') = 'nudge'
  order by q.created_at desc
  limit 1;

  if v_queue_id is null then
    return jsonb_build_object('ok', true, 'found', false);
  end if;

  delete from public.nudge_assignments na
  where na.queue_id = v_queue_id;

  delete from public.send_queue q
  where q.id = v_queue_id;

  return jsonb_build_object('ok', true, 'found', true, 'queue_id', v_queue_id);
end;
$$;

create index if not exists idx_send_queue_thread_draft_source
  on public.send_queue(thread_id, status)
  where status = 'draft';


