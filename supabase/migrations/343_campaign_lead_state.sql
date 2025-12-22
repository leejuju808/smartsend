-- Block 343 — Auto Stop Followups from AI Signals
-- campaign_lead_state table: tracks followup state per workspace + campaign + lead

create table if not exists campaign_lead_state (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,

  stop_followups boolean not null default false,
  stopped_at timestamptz,
  stopped_by_reply_id uuid references reply_logs(id),

  replied boolean not null default false,
  last_reply_id uuid references reply_logs(id),
  last_replied_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  primary key (workspace_id, campaign_id, lead_id)
);

create index if not exists campaign_lead_state_workspace_campaign_lead_idx
  on campaign_lead_state (workspace_id, campaign_id, lead_id);

create or replace function set_campaign_lead_state_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_campaign_lead_state_updated_at
on campaign_lead_state;

create trigger trg_campaign_lead_state_updated_at
before update on campaign_lead_state
for each row
execute procedure set_campaign_lead_state_updated_at();






