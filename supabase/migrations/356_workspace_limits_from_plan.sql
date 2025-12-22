-- Block 356: Sync plan limits → workspace_billing_limits
-- Keep workspace_billing_limits in sync with the selected plan, unless overrides are present.

-- Ensure workspace_billing_limits exists with needed columns
alter table workspace_billing_limits
  add column if not exists overage_behavior text not null default 'hard_stop';

-- Function to upsert workspace_billing_limits from plan + overrides
create or replace function apply_billing_plan_to_workspace(p_workspace_id uuid)
returns void as $$
declare
  ws_state workspace_billing_state%rowtype;
  plan_row billing_plans%rowtype;
  final_daily_send_cap integer;
  final_daily_reply_cap integer;
  final_seat_limit integer;
begin
  select * into ws_state
  from workspace_billing_state
  where workspace_id = p_workspace_id;

  if not found then
    return;
  end if;

  select * into plan_row
  from billing_plans
  where id = ws_state.plan_id;

  if not found then
    return;
  end if;

  final_daily_send_cap := coalesce(ws_state.override_daily_send_cap, plan_row.daily_send_cap);
  final_daily_reply_cap := coalesce(ws_state.override_daily_reply_cap, plan_row.daily_reply_cap);
  final_seat_limit := coalesce(ws_state.override_seat_limit, plan_row.seat_limit);

  insert into workspace_billing_limits (
    workspace_id,
    daily_send_cap,
    daily_reply_cap,
    seat_limit
  )
  values (
    p_workspace_id,
    final_daily_send_cap,
    final_daily_reply_cap,
    final_seat_limit
  )
  on conflict (workspace_id) do update
  set
    daily_send_cap = excluded.daily_send_cap,
    daily_reply_cap = excluded.daily_reply_cap,
    seat_limit = excluded.seat_limit;
end;
$$ language plpgsql security definer;

-- Trigger when workspace_billing_state changes
create or replace function trg_apply_billing_plan_to_workspace()
returns trigger as $$
begin
  perform apply_billing_plan_to_workspace(new.workspace_id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_workspace_billing_state_apply_plan
on workspace_billing_state;

create trigger trg_workspace_billing_state_apply_plan
after insert or update on workspace_billing_state
for each row
execute procedure trg_apply_billing_plan_to_workspace();





