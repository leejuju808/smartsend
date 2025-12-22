create table if not exists reply_thread_state (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,

  status text not null default 'open', -- 'open' | 'handled'
  last_updated_by uuid references auth.users(id),
  last_updated_at timestamptz default now(),

  primary key (workspace_id, lead_id, campaign_id)
);

create index if not exists reply_thread_state_workspace_lead_campaign_idx
  on reply_thread_state (workspace_id, lead_id, campaign_id);

create or replace function set_reply_thread_state_updated_at()
returns trigger as $$
begin
  new.last_updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reply_thread_state_updated_at
on reply_thread_state;

create trigger trg_reply_thread_state_updated_at
before update on reply_thread_state
for each row
execute procedure set_reply_thread_state_updated_at();






