-- Block 217 — Automations v1
-- Core automations table for "If Reply Intent = X → Do Y" Rules

-- Create automations table if it doesn't exist
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  trigger text not null check (trigger in ('reply_intent', 'no_reply')),
  condition jsonb default '{}'::jsonb, -- e.g. {"intent": "meeting_intent"}
  actions jsonb not null default '[]'::jsonb, -- e.g. [{"type": "tag", "tag_id": "..."}]
  enabled boolean not null default true,
  delay_hours int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure condition column exists (for existing tables)
alter table public.automations
  add column if not exists condition jsonb default '{}'::jsonb;

-- Ensure delay_hours column exists (for existing tables)
alter table public.automations
  add column if not exists delay_hours int default 0;

-- Add indexes for performance
create index if not exists idx_automations_workspace on public.automations(workspace_id);
create index if not exists idx_automations_enabled_trigger on public.automations(enabled, trigger);
create index if not exists idx_automations_reply_intent on public.automations(enabled, trigger) 
  where trigger = 'reply_intent';

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

COMMENT ON TABLE public.automations IS 'Automation rules that trigger actions based on reply intent or time-based conditions';
COMMENT ON COLUMN public.automations.condition IS 'JSON condition object, e.g. {"intent": "meeting_intent"} for reply_intent trigger';
COMMENT ON COLUMN public.automations.actions IS 'JSON array of actions, e.g. [{"type": "tag", "tag_id": "..."}, {"type": "stop_campaign"}]';










