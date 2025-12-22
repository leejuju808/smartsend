-- Sequence Templates Library v1
-- Block 401: Foundation for SmartSend's Sequence Templates Library

-- Table: sequence_templates
-- Stores template bundles (e.g., "SMB Cold Outreach 4-Step")
create table if not exists public.sequence_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  persona text, -- e.g. "SMB", "Founder", "Agency"
  created_at timestamp with time zone default now()
);

-- Table: sequence_template_steps
-- Stores each step of a template bundle
create table if not exists public.sequence_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.sequence_templates(id) on delete cascade,
  step_number int not null,
  delay_hours int not null, -- ex: send 24h after previous step
  subject text,
  body text,
  created_at timestamp with time zone default now(),
  unique(template_id, step_number)
);

-- Indexes for performance
create index if not exists idx_sequence_templates_persona on public.sequence_templates(persona);
create index if not exists idx_sequence_template_steps_template on public.sequence_template_steps(template_id, step_number);

-- Enable RLS
alter table public.sequence_templates enable row level security;
alter table public.sequence_template_steps enable row level security;

-- RLS policies: Allow all authenticated users to read templates (public library)
-- Templates are read-only for all users
create policy "sequence_templates_select_all" on public.sequence_templates
  for select
  using (true);

create policy "sequence_template_steps_select_all" on public.sequence_template_steps
  for select
  using (true);

-- Only service/admin can insert templates (via seed or admin tools)
-- Regular users cannot modify templates
create policy "sequence_templates_insert_admin" on public.sequence_templates
  for insert
  with check (false); -- Disabled for regular users, use service role for seeding

create policy "sequence_template_steps_insert_admin" on public.sequence_template_steps
  for insert
  with check (false); -- Disabled for regular users, use service role for seeding

