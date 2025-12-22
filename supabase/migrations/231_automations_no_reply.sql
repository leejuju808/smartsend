-- Block 218 — Automations v2
-- No-Reply Timers, Time-Based Rules, Auto-Follow-Up Triggers, Auto-Stage Movement

-- Create automations table if it doesn't exist (simpler structure than automation_rules)
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  trigger text not null check (trigger in ('reply_intent', 'no_reply')),
  condition jsonb default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  delay_hours int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add delay_hours column if table already exists but column doesn't
alter table public.automations
  add column if not exists delay_hours int default 0;

-- Add indexes for performance
create index if not exists idx_automations_workspace on public.automations(workspace_id);
create index if not exists idx_automations_enabled_trigger on public.automations(enabled, trigger);
create index if not exists idx_automations_no_reply on public.automations(enabled, trigger, delay_hours) 
  where trigger = 'no_reply';

-- Enable RLS
alter table public.automations enable row level security;

-- RLS policies
drop policy if exists "Users can view automations for their workspace" on public.automations;
create policy "Users can view automations for their workspace" on public.automations
  for select using (
    exists (
      select 1 from public.workspaces w 
      where w.id = automations.workspace_id 
      and w.id in (
        select workspace_id from public.workspace_members 
        where user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can manage automations for their workspace" on public.automations;
create policy "Users can manage automations for their workspace" on public.automations
  for all using (
    exists (
      select 1 from public.workspaces w 
      where w.id = automations.workspace_id 
      and w.id in (
        select workspace_id from public.workspace_members 
        where user_id = auth.uid()
      )
    )
  );

-- Ensure reply_threads has the fields we need for no-reply detection
alter table public.reply_threads
  add column if not exists first_sent_at timestamptz,
  add column if not exists last_incoming_message_at timestamptz;

-- Create index for efficient no-reply queries
create index if not exists idx_reply_threads_no_reply on public.reply_threads(first_sent_at, last_incoming_message_at)
  where last_incoming_message_at is null;










