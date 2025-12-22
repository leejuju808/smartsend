-- Block 339: Default Workspace Limits Function
-- Helper function to auto-create default workspace billing limits

create or replace function create_default_workspace_limits(workspace uuid)
returns void as $$
begin
  insert into workspace_billing_limits (
    workspace_id,
    plan_code,
    daily_send_cap,
    daily_reply_cap,
    per_sender_daily_cap,
    seats_allowed,
    hard_stop,
    warning_threshold_pct
  )
  values (
    workspace,
    'free',
    500,
    1000,
    300,
    1,
    true,
    80
  )
  on conflict (workspace_id) do nothing;
end;
$$ language plpgsql;






