-- Add AI reply events table for metered billing
create table if not exists public.ai_reply_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  user_id uuid not null,
  source text default 'dashboard',   -- 'dashboard' | 'extension' | etc
  created_at timestamptz default now()
);

-- Create index for efficient querying by team and time
create index if not exists idx_ai_team_time on public.ai_reply_events (team_id, created_at);

-- Add Stripe usage tracking fields to teams table
alter table public.teams
  add column if not exists stripe_usage_item_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end   timestamptz;

-- Add RLS policies for ai_reply_events
alter table public.ai_reply_events enable row level security;

-- Users can view events for their team
create policy "Users can view AI reply events for their team" on public.ai_reply_events
  for select using (
    team_id in (
      select team_id from public.workspace_members 
      where user_id = auth.uid()
    )
  );

-- Users can insert events for their team
create policy "Users can insert AI reply events for their team" on public.ai_reply_events
  for insert with check (
    team_id in (
      select team_id from public.workspace_members 
      where user_id = auth.uid()
    )
  ); 