-- /supabase/migrations/20251026_send_counters_rpc.sql
-- Atomic increment function for send counters

create or replace function incr_send_counter(p_workspace uuid, p_window text, p_delta int)
returns void
language sql
as $$
  insert into send_counters(workspace_id, window, count)
  values (p_workspace, p_window, p_delta)
  on conflict (workspace_id, window)
  do update set count = send_counters.count + excluded.count;
$$;
