-- Create lead_notes table for CRM-grade lead profile sidebar
-- Block 168 — Lead Activity Timeline

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid references public.leads(id) on delete cascade,
  account_id uuid not null,
  body text not null
);

create index if not exists idx_lead_notes_lead
  on public.lead_notes (lead_id);












