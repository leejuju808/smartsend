-- Per-message tracking id & counters
do $$ begin
  alter table campaign_messages add column if not exists tracking_id uuid default gen_random_uuid();
  alter table campaign_messages add column if not exists open_count int not null default 0;
  alter table campaign_messages add column if not exists click_count int not null default 0;
  alter table campaign_messages add column if not exists last_open_at timestamptz;
  alter table campaign_messages add column if not exists last_click_at timestamptz;
exception when duplicate_column then null; end $$;

create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid,
  message_id uuid not null references campaign_messages(id) on delete cascade,
  tracking_id uuid not null,
  type text not null check (type in ('open','click','bounce','delivered')),
  url text,
  user_agent text,
  ip inet,
  created_at timestamptz default now()
);

create index if not exists email_events_message_idx on email_events(message_id);
create index if not exists email_events_type_idx on email_events(type);

-- RLS (members can read, owner/admin write via server role)
alter table email_events enable row level security;
create policy "events readable in workspace"
on email_events for select using (is_workspace_member(workspace_id));
create policy "events writable by server"
on email_events for insert with check (has_workspace_role(workspace_id, array['owner','admin']));