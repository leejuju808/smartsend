-- Block 320 — Meeting Pipeline v1
-- Auto-create meeting opportunities from replies + simple Kanban

-- 1) Extend reply_logs with AI fields (if Block 319 didn't add them)
alter table public.reply_logs
  add column if not exists workspace_id uuid references workspaces(id) on delete cascade,
  add column if not exists lead_id uuid references leads(id) on delete cascade,
  add column if not exists ai_has_meeting boolean default false,
  add column if not exists ai_category text check (ai_category in ('interested', 'not_interested', 'meeting', 'ooo', 'unsubscribe', 'bounce', 'unclear', 'neutral', 'bounce', 'out_of_office'));

create index if not exists reply_logs_workspace_idx on public.reply_logs(workspace_id);
create index if not exists reply_logs_lead_idx on public.reply_logs(lead_id);
create index if not exists reply_logs_ai_has_meeting_idx on public.reply_logs(ai_has_meeting) where ai_has_meeting = true;

-- 2) Create/update lead_meetings table
create table if not exists lead_meetings (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  lead_id uuid not null references leads(id) on delete cascade,
  reply_id uuid references reply_logs(id) on delete set null,

  title text,
  status text not null default 'new',  -- 'new', 'scheduled', 'completed', 'lost'
  owner_user_id uuid references auth.users(id),
  meeting_url text,
  start_time timestamptz,
  end_time timestamptz,
  notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists lead_meetings_workspace_idx
  on lead_meetings (workspace_id);

create index if not exists lead_meetings_status_idx
  on lead_meetings (workspace_id, status);

create index if not exists lead_meetings_lead_idx
  on lead_meetings (workspace_id, lead_id);

-- simple update trigger for updated_at
create or replace function set_lead_meetings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lead_meetings_updated_at on lead_meetings;

create trigger trg_lead_meetings_updated_at
before update on lead_meetings
for each row
execute procedure set_lead_meetings_updated_at();

-- Enable RLS on lead_meetings
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
      select 1 from team_members tm
      where tm.workspace_id = lead_meetings.workspace_id
      and tm.user_id = auth.uid()
    )
  );

-- RLS Policies: Users can update meetings for their workspace
drop policy if exists "Users can update lead_meetings" on lead_meetings;
create policy "Users can update lead_meetings" on lead_meetings
  for update using (
    exists (
      select 1 from team_members tm
      where tm.workspace_id = lead_meetings.workspace_id
      and tm.user_id = auth.uid()
    )
  );

-- RLS Policies: Users can insert meetings for their workspace
drop policy if exists "Users can insert lead_meetings" on lead_meetings;
create policy "Users can insert lead_meetings" on lead_meetings
  for insert with check (
    exists (
      select 1 from team_members tm
      where tm.workspace_id = lead_meetings.workspace_id
      and tm.user_id = auth.uid()
    )
  );







