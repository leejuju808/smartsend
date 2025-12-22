-- Block 305 — Meeting Pipeline & Calendar Export
-- Lead Meetings Table + View

create table if not exists lead_meetings (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  reply_id uuid references reply_logs(id) on delete set null,

  title text,
  notes text,

  start_time timestamptz,
  end_time timestamptz,
  timezone text,
  location text,
  link text,

  status text not null default 'new' 
    check (status in ('new', 'confirmed', 'completed', 'canceled', 'no_show')),

  created_at timestamptz default now()
);

create index on lead_meetings (workspace_id);
create index on lead_meetings (lead_id);
create index on lead_meetings (start_time);

create or replace view meeting_pipeline_view as
select
  m.id,
  m.workspace_id,
  m.lead_id,
  m.campaign_id,
  m.reply_id,
  m.title,
  m.start_time,
  m.end_time,
  m.timezone,
  m.location,
  m.link,
  m.status,
  m.created_at,
  l.first_name,
  l.last_name,
  l.email as lead_email,
  l.company
from lead_meetings m
join leads l on l.id = m.lead_id;

-- Enable RLS
alter table lead_meetings enable row level security;

-- RLS Policies: Service role can manage all meetings
drop policy if exists "Service can manage lead_meetings" on lead_meetings;
create policy "Service can manage lead_meetings" on lead_meetings
  for all using (true) with check (true);

-- RLS Policies: Users can view meetings for their workspace
drop policy if exists "Users can view lead_meetings" on lead_meetings;
create policy "Users can view lead_meetings" on lead_meetings
  for select using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = lead_meetings.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- RLS Policies: Users can update meetings for their workspace
drop policy if exists "Users can update lead_meetings" on lead_meetings;
create policy "Users can update lead_meetings" on lead_meetings
  for update using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = lead_meetings.workspace_id
      and wm.user_id = auth.uid()
    )
  );







