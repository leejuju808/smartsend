create table if not exists reply_thread_meeting (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,

  status text not null default 'pending' check (
    status in ('pending', 'booked', 'completed', 'no_show', 'canceled')
  ),
  meeting_at timestamptz,
  notes text,

  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  primary key (workspace_id, lead_id, campaign_id)
);

create index if not exists reply_thread_meeting_workspace_lead_campaign_idx
  on reply_thread_meeting (workspace_id, lead_id, campaign_id);

create or replace function set_reply_thread_meeting_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reply_thread_meeting_updated_at
on reply_thread_meeting;

create trigger trg_reply_thread_meeting_updated_at
before update on reply_thread_meeting
for each row
execute procedure set_reply_thread_meeting_updated_at();






