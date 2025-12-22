-- Campaign Steps for SmartSend Sequencer
-- This extends campaigns to support multiple steps (D0/D3/D7 follow-ups)

-- Add campaign_steps table for multi-step campaigns
create table if not exists public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_index int not null, -- 0, 1, 2, etc.
  subject text not null,
  body_html text not null,
  delay_days int not null default 0, -- days after previous step
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure unique step per campaign
  unique(campaign_id, step_index)
);

-- Add sequence-related columns to campaigns table
alter table if exists public.campaigns 
  add column if not exists is_sequence boolean default false;

alter table if exists public.campaigns 
  add column if not exists current_step int default 0;

alter table if exists public.campaigns 
  add column if not exists last_sent_step int default -1;

alter table if exists public.campaigns 
  add column if not exists next_eligible_at timestamptz;

-- Add step tracking to campaign_recipients
alter table if exists public.campaign_recipients 
  add column if not exists step_index int default 0;

alter table if exists public.campaign_recipients 
  add column if not exists last_sent_step int default -1;

alter table if exists public.campaign_recipients 
  add column if not exists next_eligible_at timestamptz;

-- Create indexes for performance
create index if not exists idx_campaign_steps_campaign on public.campaign_steps(campaign_id, step_index);
create index if not exists idx_campaign_recipients_step on public.campaign_recipients(campaign_id, step_index, status);
create index if not exists idx_campaign_recipients_next on public.campaign_recipients(campaign_id, next_eligible_at, status);

-- Enable RLS
alter table public.campaign_steps enable row level security;

-- RLS policies for campaign_steps
create policy if not exists "campaign_steps_select_own" on public.campaign_steps 
  for select using (
    exists (
      select 1 from public.campaigns 
      where id = campaign_id and user_id = auth.uid()
    )
  );

create policy if not exists "campaign_steps_insert_own" on public.campaign_steps 
  for insert with check (
    exists (
      select 1 from public.campaigns 
      where id = campaign_id and user_id = auth.uid()
    )
  );

create policy if not exists "campaign_steps_update_own" on public.campaign_steps 
  for update using (
    exists (
      select 1 from public.campaigns 
      where id = campaign_id and user_id = auth.uid()
    )
  );

create policy if not exists "campaign_steps_delete_own" on public.campaign_steps 
  for delete using (
    exists (
      select 1 from public.campaigns 
      where id = campaign_id and user_id = auth.uid()
    )
  );

-- Function to get next step for a campaign
create or replace function get_next_campaign_step(
  p_campaign_id uuid,
  p_current_step int
) returns int as $$
declare
  next_step int;
begin
  select step_index into next_step
  from public.campaign_steps
  where campaign_id = p_campaign_id 
    and step_index > p_current_step
  order by step_index
  limit 1;
  
  return coalesce(next_step, -1);
end;
$$ language plpgsql security definer;

-- Function to compose step email content
create or replace function compose_step_email(
  p_campaign_id uuid,
  p_contact_id uuid,
  p_step_index int
) returns table(subject text, body_html text) as $$
begin
  return query
  select cs.subject, cs.body_html
  from public.campaign_steps cs
  where cs.campaign_id = p_campaign_id 
    and cs.step_index = p_step_index;
end;
$$ language plpgsql security definer; 