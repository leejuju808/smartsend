-- Block 89: OOO reentry support

-- 1) Ensure pause fields on threads/leads
do $$
begin
  alter table public.threads add column if not exists paused_until timestamptz;
  alter table public.leads add column if not exists next_nudge_preset text;
exception
  when duplicate_column then
    null;
end
$$;

-- 2) Reentry jobs (for observability & retries)
create table if not exists public.ooo_reentry_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  thread_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  ooo_message_id uuid not null references public.messages(id) on delete cascade,
  resume_at timestamptz not null,
  preset text not null default 'ooo_reentry',
  status text not null default 'scheduled' check (status in ('scheduled', 'running', 'done', 'failed')),
  error text
);

create index if not exists idx_ooo_reentry_due on public.ooo_reentry_jobs (resume_at, status);

alter table public.ooo_reentry_jobs enable row level security;

create policy ooo_reentry_iso on public.ooo_reentry_jobs
  using (account_id = auth.uid());

