-- Enable trigram for fuzzy
create extension if not exists pg_trgm;

-- 1) Candidate pairs (suggested merges)
create table if not exists public.lead_match_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id_a uuid not null references public.leads(id) on delete cascade,
  lead_id_b uuid not null references public.leads(id) on delete cascade,
  reason text not null,
  score numeric not null,
  status text not null default 'open' check (status in ('open','ignored','merged')),
  unique (account_id, lead_id_a, lead_id_b)
);

comment on column public.lead_match_candidates.reason is 'same_email, same_domain_name_match, company_fuzzy';
comment on column public.lead_match_candidates.score is '0..1 match score';

create index if not exists idx_lmc_acct_status on public.lead_match_candidates(account_id, status);

-- 2) Merge jobs (review → execute)
create table if not exists public.lead_merge_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  survivor_lead_id uuid not null references public.leads(id) on delete cascade,
  mergee_lead_id uuid not null references public.leads(id) on delete cascade,
  decided_by uuid references auth.users(id) on delete set null,
  field_overrides jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','done','failed','undone')),
  error text
);

create index if not exists idx_lmj_acct_status on public.lead_merge_jobs(account_id, status);

-- 3) Audit log (pre/post snapshots + FK rewrites)
create table if not exists public.lead_merge_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_id uuid not null references public.lead_merge_jobs(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  survivor_before jsonb not null,
  mergee_before jsonb not null,
  survivor_after jsonb,
  rewired jsonb not null default '[]'::jsonb,
  deleted_ids jsonb not null default '[]'::jsonb
);

comment on column public.lead_merge_audit.rewired is 'Array of {table, count}';
comment on column public.lead_merge_audit.deleted_ids is 'Array of {table, id}';

create index if not exists idx_lma_job on public.lead_merge_audit(job_id);

-- 4) Helpful uniqueness (soft) — not strictly required but recommended
create index if not exists idx_leads_email_norm on public.leads (lower(email));
create index if not exists idx_leads_company_trgm on public.leads using gin (company_name gin_trgm_ops);
create index if not exists idx_leads_name_trgm on public.leads using gin ((coalesce(first_name,'')||' '||coalesce(last_name,'')) gin_trgm_ops);

-- 5) RLS
alter table public.lead_match_candidates enable row level security;
alter table public.lead_merge_jobs enable row level security;
alter table public.lead_merge_audit enable row level security;

create policy lmc_iso on public.lead_match_candidates
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy lmj_iso on public.lead_merge_jobs
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy lma_iso on public.lead_merge_audit
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

