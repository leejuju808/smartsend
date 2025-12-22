create or replace function public.nudge_cancel_drafts(p_thread_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_total int := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if p_thread_ids is null or array_length(p_thread_ids, 1) is null then
    return jsonb_build_object('ok', true, 'total', 0, 'items', '[]'::jsonb);
  end if;

  for rec in
    select t.id as thread_id,
           array_agg(q.id) filter (where q.id is not null) as q_ids
    from unnest(p_thread_ids) as t_id
    join public.inbox_threads as t on t.id = t_id
    left join public.send_queue as q
      on q.thread_id = t.id
     and q.status = 'draft'
     and coalesce(q.meta ->> 'source', '') = 'nudge'
    group by t.id
  loop
    if rec.q_ids is not null then
      delete from public.nudge_assignments as na where na.queue_id = any(rec.q_ids);
      delete from public.send_queue as q where q.id = any(rec.q_ids);
      v_total := v_total + 1;
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'thread_id', rec.thread_id,
          'canceled', true,
          'queue_ids', to_jsonb(rec.q_ids)
        )
      );
    else
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'thread_id', rec.thread_id,
          'canceled', false,
          'queue_ids', '[]'::jsonb
        )
      );
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'total', v_total, 'items', v_items);
end;
$$;

create index if not exists idx_sq_draft_nudge on public.send_queue(thread_id) where status = 'draft';

