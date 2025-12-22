-- Block 356: Plan Metadata & Limits Mapping v1
-- billing_plans + workspace_billing_state

create table if not exists billing_plans (
  id text primary key, -- e.g. 'free', 'starter', 'growth', 'scale'
  stripe_price_id text, -- nullable if not mapped yet
  name text not null,
  description text,

  -- default limits for this plan
  daily_send_cap integer not null default 200,
  daily_reply_cap integer,
  seat_limit integer,

  is_active boolean not null default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function set_billing_plans_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_billing_plans_updated_at
on billing_plans;

create trigger trg_billing_plans_updated_at
before update on billing_plans
for each row
execute procedure set_billing_plans_updated_at();

-- Which plan a workspace is on
create table if not exists workspace_billing_state (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  plan_id text not null references billing_plans(id),

  -- optional override flags if you want to tweak specific customers later
  override_daily_send_cap integer,
  override_daily_reply_cap integer,
  override_seat_limit integer,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function set_workspace_billing_state_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_workspace_billing_state_updated_at
on workspace_billing_state;

create trigger trg_workspace_billing_state_updated_at
before update on workspace_billing_state
for each row
execute procedure set_workspace_billing_state_updated_at();

-- Seed some basic plans
-- Adjust numbers to taste.
insert into billing_plans (id, name, description, daily_send_cap, daily_reply_cap, seat_limit)
values
  ('free', 'Free', 'For testing SmartSend with small batches.', 50, 50, 1),
  ('starter', 'Starter', 'For solo operators sending at consistent volume.', 500, 200, 1),
  ('growth', 'Growth', 'For small teams sending in higher volume.', 2000, 500, 5)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  daily_send_cap = excluded.daily_send_cap,
  daily_reply_cap = excluded.daily_reply_cap,
  seat_limit = excluded.seat_limit;

-- Enable RLS on billing_plans
alter table billing_plans enable row level security;

-- Everyone can read billing plans (public info)
drop policy if exists billing_plans_select on billing_plans;
create policy billing_plans_select on billing_plans
  for select to authenticated
  using (is_active = true);

-- Service role can manage plans
drop policy if exists billing_plans_service on billing_plans;
create policy billing_plans_service on billing_plans
  for all to service_role
  using (true) with check (true);

-- Enable RLS on workspace_billing_state
alter table workspace_billing_state enable row level security;

-- Workspace members can read their workspace billing state
drop policy if exists workspace_billing_state_select on workspace_billing_state;
create policy workspace_billing_state_select on workspace_billing_state
  for select to authenticated
  using (
    exists (
      select 1 from team_members
      where workspace_id = workspace_billing_state.workspace_id
      and user_id = auth.uid()
      and status = 'active'
    )
    or exists (
      select 1 from workspace_members
      where workspace_id = workspace_billing_state.workspace_id
      and user_id = auth.uid()
    )
  );

-- Service role can manage workspace billing state
drop policy if exists workspace_billing_state_service on workspace_billing_state;
create policy workspace_billing_state_service on workspace_billing_state
  for all to service_role
  using (true) with check (true);





