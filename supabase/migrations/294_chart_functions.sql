-- Block 294: Chart Functions for Billing Overview
-- 7-day history functions for sends and replies

create or replace function chart_sends_7d(workspace_input uuid)
returns table(day date, count integer)
language plpgsql
security definer
as $$
begin
  return query
    select d::date as day,
           (
             select count(*)::integer
             from send_logs sl
             where sl.workspace_id = workspace_input
             and sl.sent_at::date = d::date
           ) as count
    from generate_series(
      current_date - interval '6 days',
      current_date,
      interval '1 day'
    ) d;
end;
$$;

create or replace function chart_replies_7d(workspace_input uuid)
returns table(day date, count integer)
language plpgsql
security definer
as $$
begin
  return query
    select d::date as day,
           (
             select count(*)::integer
             from inbound_messages im
             where im.workspace_id = workspace_input
             and im.received_at::date = d::date
           ) as count
    from generate_series(
      current_date - interval '6 days',
      current_date,
      interval '1 day'
    ) d;
end;
$$;

-- Grant execute permissions to authenticated users
grant execute on function chart_sends_7d(uuid) to authenticated;
grant execute on function chart_replies_7d(uuid) to authenticated;








