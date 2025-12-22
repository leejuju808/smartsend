-- Block 409 — Lead Timeline v1 (Unified Activity Feed)
-- Creates lead_activity table for non-email CRM events
-- 
-- Schema additions:
-- 1. lead_activity table for follow-up changes, reply reason tags, notes

-- 1.1 Create lead_activity table
create table if not exists public.lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  campaign_lead_id uuid references public.campaign_leads(id) on delete cascade,
  activity_type text not null check (
    activity_type in (
      'follow_up_set',
      'follow_up_completed',
      'reply_reason_set',
      'note_added'
    )
  ),
  activity_data jsonb,
  created_at timestamptz default now()
);

-- Create indexes for fast lookups
create index if not exists idx_lead_activity_lead_id 
  on public.lead_activity(lead_id);

create index if not exists idx_lead_activity_campaign_lead_id 
  on public.lead_activity(campaign_lead_id);

create index if not exists idx_lead_activity_created_at 
  on public.lead_activity(created_at);

create index if not exists idx_lead_activity_type 
  on public.lead_activity(activity_type);

-- Enable RLS
alter table public.lead_activity enable row level security;

-- RLS policy: Users can view activities for leads in their workspace
create policy "Users can view lead activities for their workspace"
  on public.lead_activity
  for select
  using (
    exists (
      select 1
      from public.campaign_leads cl
      join public.campaigns c on c.id = cl.campaign_id
      join public.team_members tm on tm.workspace_id = c.workspace_id
      where cl.id = lead_activity.campaign_lead_id
        and tm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.leads l
      join public.campaign_leads cl2 on cl2.lead_id = l.id
      join public.campaigns c2 on c2.id = cl2.campaign_id
      join public.team_members tm2 on tm2.workspace_id = c2.workspace_id
      where l.id = lead_activity.lead_id
        and tm2.user_id = auth.uid()
    )
  );

-- RLS policy: Service role and authenticated users can insert activities
create policy "Authenticated users can insert lead activities"
  on public.lead_activity
  for insert
  with check (
    exists (
      select 1
      from public.campaign_leads cl
      join public.campaigns c on c.id = cl.campaign_id
      join public.team_members tm on tm.workspace_id = c.workspace_id
      where cl.id = lead_activity.campaign_lead_id
        and tm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.leads l
      join public.campaign_leads cl2 on cl2.lead_id = l.id
      join public.campaigns c2 on c2.id = cl2.campaign_id
      join public.team_members tm2 on tm2.workspace_id = c2.workspace_id
      where l.id = lead_activity.lead_id
        and tm2.user_id = auth.uid()
    )
  );



