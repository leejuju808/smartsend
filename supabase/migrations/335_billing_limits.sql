-- Block 335: Send Quota Enforcement v1
-- Hard daily caps per workspace + per-sender in dispatcher

-- a) Workspace billing limits
create table if not exists workspace_billing_limits (
  workspace_id uuid primary key references workspaces(id) on delete cascade,

  -- Plan identifier (e.g. "free", "starter", "pro")
  plan_code text not null default 'free',

  -- Hard caps (per day, per workspace)
  daily_send_cap integer not null default 500,   -- total emails per day
  daily_reply_cap integer not null default 1000, -- reserved if needed later

  -- Optional per-sender cap (per connected inbox) for safety
  per_sender_daily_cap integer not null default 300,

  -- Whether to hard stop sends when cap hit (true) or just warn (false)
  hard_stop boolean not null default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function set_workspace_billing_limits_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_workspace_billing_limits_updated_at on workspace_billing_limits;

create trigger trg_workspace_billing_limits_updated_at
before update on workspace_billing_limits
for each row
execute procedure set_workspace_billing_limits_updated_at();

-- b) Campaign "over quota" flag
alter table campaigns
  add column if not exists over_quota boolean not null default false;

-- Index for efficient quota checks
create index if not exists idx_campaigns_over_quota on campaigns(over_quota) where over_quota = true;

-- RLS policies for workspace_billing_limits
alter table workspace_billing_limits enable row level security;

-- Service role can read/write (for dispatcher)
drop policy if exists workspace_billing_limits_service on workspace_billing_limits;
create policy workspace_billing_limits_service on workspace_billing_limits
  for all to service_role
  using (true) with check (true);

-- Workspace members can read their workspace limits
drop policy if exists workspace_billing_limits_select on workspace_billing_limits;
create policy workspace_billing_limits_select on workspace_billing_limits
  for select to authenticated
  using (
    exists (
      select 1 from workspace_members
      where workspace_id = workspace_billing_limits.workspace_id
      and user_id = auth.uid()
    )
  );






