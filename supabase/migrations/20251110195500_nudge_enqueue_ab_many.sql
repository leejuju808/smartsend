set search_path = public, pg_temp;

create or replace function public.nudge_enqueue_ab_many(p_thread_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  tid uuid;
  v_ok int := 0;
  v_block int := 0;
  v_items jsonb := '[]'::jsonb;
  v_res jsonb;
begin
  if p_thread_ids is null or array_length(p_thread_ids, 1) is null then
    return jsonb_build_object(
      'ok', true,
      'success', 0,
      'blocked', 0,
      'items', '[]'::jsonb
    );
  end if;

  foreach tid in array p_thread_ids loop
    begin
      select to_jsonb(row)
      into v_res
      from public.nudge_enqueue_ab(tid) as row;

      if not found then
        v_res := jsonb_build_object(
          'ok', false,
          'reason', 'no_result'
        );
      end if;

      if coalesce((v_res ->> 'ok')::boolean, false) then
        v_ok := v_ok + 1;
        v_items := v_items || jsonb_build_array(
          jsonb_build_object(
            'thread_id', tid,
            'status', 'queued',
            'variant_id', v_res ->> 'variant_id',
            'queue_id', v_res ->> 'send_queue_id'
          )
        );
      else
        v_block := v_block + 1;
        v_items := v_items || jsonb_build_array(
          jsonb_build_object(
            'thread_id', tid,
            'status', 'blocked',
            'reason', v_res ->> 'reason'
          )
        );
      end if;
    exception
      when others then
        v_block := v_block + 1;
        v_items := v_items || jsonb_build_array(
          jsonb_build_object(
            'thread_id', tid,
            'status', 'blocked',
            'reason', sqlerrm
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'success', v_ok,
    'blocked', v_block,
    'items', v_items
  );
end
$function$;

revoke all on function public.nudge_enqueue_ab_many(uuid[]) from public;
grant execute on function public.nudge_enqueue_ab_many(uuid[]) to authenticated;

create index if not exists idx_normalized_messages_thread_outbound_sent_at
  on public.normalized_messages (linked_thread_id, sent_at)
  where direction = 'outbound';

