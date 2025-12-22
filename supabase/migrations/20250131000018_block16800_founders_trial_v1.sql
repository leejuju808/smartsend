-- Block 16800 — Founders-10 Lifetime Discount + Trial Mode v1
-- First 10 Roofers Get a Cheaper Plan Forever

-- Add founder flags and trial fields to workspaces
alter table public.workspaces
  add column if not exists is_founder boolean not null default false,
  add column if not exists founder_notes text,
  add column if not exists founder_discount_pct int, -- e.g. 30, 40, 50
  add column if not exists trial_ends_at timestamptz,
  add column if not exists is_trial_active boolean not null default false;

-- Create index on is_founder for filtering founders
create index if not exists idx_workspaces_is_founder 
  on public.workspaces(is_founder) 
  where is_founder = true;

-- Create index on is_trial_active for trial queries
create index if not exists idx_workspaces_is_trial_active 
  on public.workspaces(is_trial_active) 
  where is_trial_active = true;

comment on column public.workspaces.is_founder is
  'True if this workspace is one of the first 10 founders';
comment on column public.workspaces.founder_notes is
  'Notes about this founder account (e.g., "Founders-10 plan: $119 Growth locked")';
comment on column public.workspaces.founder_discount_pct is
  'Percentage discount off public price (e.g., 40 = 40% off forever)';
comment on column public.workspaces.trial_ends_at is
  'When the trial period ends (for 7-day or custom trials)';
comment on column public.workspaces.is_trial_active is
  'True if trial mode is currently active';



























































