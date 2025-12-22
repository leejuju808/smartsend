-- Create leads and sequence_enrollments tables for linking sequences to leads
-- This migration creates the necessary tables to enroll leads into sequences

-- Create leads table
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  created_at timestamptz default now()
);

-- Create sequence_enrollments table
create table if not exists public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  sequence_id uuid references public.sequences(id) on delete cascade,
  current_step int default 0,
  status text default 'active',
  created_at timestamptz default now()
);

-- Create indexes for better performance
create index if not exists idx_leads_email on public.leads(email);
create index if not exists idx_sequence_enrollments_lead on public.sequence_enrollments(lead_id);
create index if not exists idx_sequence_enrollments_sequence on public.sequence_enrollments(sequence_id);
create index if not exists idx_sequence_enrollments_status on public.sequence_enrollments(status);

-- Enable RLS
alter table public.leads enable row level security;
alter table public.sequence_enrollments enable row level security;

-- Create RLS policies (assuming we'll add user_id later or use workspace-based access)
-- For now, allow all operations - this can be refined based on your auth system
create policy if not exists "leads_all_access" on public.leads for all using (true) with check (true);
create policy if not exists "sequence_enrollments_all_access" on public.sequence_enrollments for all using (true) with check (true);