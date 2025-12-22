-- SmartSend v3: AI Sales Agent System
-- This migration creates the foundation for autonomous AI agents that prospect, qualify, and engage leads

-- AI Agents Table
create table if not exists ai_agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  status text default 'idle' check (status in ('idle', 'scouting', 'messaging', 'paused')),
  autopilot_enabled boolean default false,
  target_industry text,
  target_role text,
  daily_lead_limit int default 50,
  daily_message_limit int default 100,
  leads_generated int default 0,
  leads_converted int default 0,
  messages_sent int default 0,
  replies_received int default 0,
  win_rate numeric(5,2) default 0.00,
  config jsonb default '{}'::jsonb, -- flexible config for future features
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- AI Leads Queue Table
create table if not exists ai_leads_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  agent_id uuid references ai_agents(id) on delete set null,
  source text check (source in ('linkedin', 'web', 'manual', 'google_maps')),
  company text,
  contact_name text,
  email text,
  phone text,
  linkedin_url text,
  website text,
  title text,
  industry text,
  location text,
  score numeric(5,2), -- AI relevance score 0-100
  status text default 'new' check (status in ('new', 'messaged', 'replied', 'interested', 'not_now', 'disqualified', 'converted')),
  message_sent_at timestamptz,
  first_reply_at timestamptz,
  notes jsonb default '{}'::jsonb, -- store enrichment data, conversation context, etc.
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_ai_agents_org on ai_agents(org_id);
create index if not exists idx_ai_agents_status on ai_agents(status);
create index if not exists idx_ai_leads_org on ai_leads_queue(org_id);
create index if not exists idx_ai_leads_agent on ai_leads_queue(agent_id);
create index if not exists idx_ai_leads_status on ai_leads_queue(status);
create index if not exists idx_ai_leads_score on ai_leads_queue(score desc);
create index if not exists idx_ai_leads_email on ai_leads_queue(email);

-- Enable RLS
alter table ai_agents enable row level security;
alter table ai_leads_queue enable row level security;

-- RLS Policies: only org members can access their org's agents and leads
create policy ai_agents_read on ai_agents
  for select using (is_org_member(org_id, auth.uid()));

create policy ai_agents_write on ai_agents
  for all using (is_org_member(org_id, auth.uid()))
  with check (is_org_member(org_id, auth.uid()));

create policy ai_leads_read on ai_leads_queue
  for select using (is_org_member(org_id, auth.uid()));

create policy ai_leads_write on ai_leads_queue
  for all using (is_org_member(org_id, auth.uid()))
  with check (is_org_member(org_id, auth.uid()));

-- Function to update agent stats when lead status changes
create or replace function update_agent_stats()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' and OLD.status != NEW.status then
    -- Update agent stats based on status change
    if NEW.status = 'replied' and OLD.status != 'replied' then
      update ai_agents
      set replies_received = replies_received + 1,
          updated_at = now()
      where id = NEW.agent_id;
    end if;
    
    if NEW.status = 'converted' and OLD.status != 'converted' then
      update ai_agents
      set leads_converted = leads_converted + 1,
          updated_at = now()
      where id = NEW.agent_id;
    end if;
    
    -- Recalculate win rate
    update ai_agents
    set win_rate = case
      when messages_sent > 0 then (leads_converted::numeric / messages_sent::numeric * 100)
      else 0
    end,
    updated_at = now()
    where id = NEW.agent_id;
  end if;
  
  return NEW;
end;
$$;

-- Trigger to auto-update agent stats
create trigger ai_leads_status_update
  after update on ai_leads_queue
  for each row
  execute function update_agent_stats();

-- Function to auto-update updated_at timestamp
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger ai_agents_updated_at
  before update on ai_agents
  for each row
  execute function update_updated_at();

create trigger ai_leads_updated_at
  before update on ai_leads_queue
  for each row
  execute function update_updated_at();

-- Comments
comment on table ai_agents is 'Autonomous AI sales agents that prospect and engage leads';
comment on table ai_leads_queue is 'Queue of leads discovered by AI agents, ready for outreach';

