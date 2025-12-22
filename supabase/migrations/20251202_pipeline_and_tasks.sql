-- Add pipeline_stage to leads and create follow_up_tasks table

alter table public.leads
  add column if not exists pipeline_stage text
  check (pipeline_stage in ('new','engaged','won','lost')) default 'new';

create index if not exists idx_leads_pipeline on public.leads (pipeline_stage);

create table if not exists public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'open' check (status in ('open','done','snoozed','cancelled')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_owner_status_due on public.follow_up_tasks (owner_id, status, due_at);
create index if not exists idx_tasks_lead on public.follow_up_tasks (lead_id);
