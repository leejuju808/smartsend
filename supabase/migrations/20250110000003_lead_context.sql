-- Lead Context Right-Rail (Smart CRM Panel)
-- Adds columns and activity tracking for lead context panel

-- Add columns to leads table if they don't exist
alter table public.leads add column if not exists company text;
alter table public.leads add column if not exists phone text;
alter table public.leads add column if not exists tags text[] default '{}';
alter table public.leads add column if not exists notes text;

-- Create lead_activity table for tracking opens, clicks, replies, notes
create table if not exists public.lead_activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null check (type in ('open', 'click', 'reply', 'note')),
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Create index for lead activity lookups
create index if not exists idx_lead_activity_lead on public.lead_activity(lead_id);
create index if not exists idx_lead_activity_type on public.lead_activity(type);
create index if not exists idx_lead_activity_created on public.lead_activity(created_at desc);

-- Enable RLS on lead_activity
alter table public.lead_activity enable row level security;

-- RLS policy for lead_activity (users can see activities for leads they have access to)
drop policy if exists "lead_activity_select" on public.lead_activity;
create policy "lead_activity_select" on public.lead_activity
  for select using (
    exists (
      select 1 from public.leads 
      where leads.id = lead_activity.lead_id
    )
  );

