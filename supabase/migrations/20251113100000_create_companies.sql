-- Block 175: Unified Company Profiles
-- Creates companies table for company-level CRM intelligence

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null,
  name text,
  website text,
  industry text,
  size text,
  tech_stack jsonb default '[]'::jsonb,
  location text,
  linkedin text,
  twitter text,
  notes jsonb default '[]'::jsonb,
  unique(org_id, domain)
);

-- Indexes
create index if not exists idx_companies_domain on public.companies(domain);
create index if not exists idx_companies_org on public.companies(org_id);
create index if not exists idx_companies_name on public.companies(name) where name is not null;

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.companies enable row level security;

-- Helper function to check org membership
create or replace function public.is_org_member(_org_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.org_memberships
    where org_id = _org_id and user_id = auth.uid() and status = 'active'
  );
$$;

-- RLS Policies
drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies for select using (
  is_org_member(org_id)
);

drop policy if exists "companies_write" on public.companies;
create policy "companies_write" on public.companies for insert with check (
  is_org_member(org_id)
);

drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies for update using (
  is_org_member(org_id)
) with check (
  is_org_member(org_id)
);

drop policy if exists "companies_delete" on public.companies;
create policy "companies_delete" on public.companies for delete using (
  exists(
    select 1 from public.org_memberships m
    where m.org_id = companies.org_id
    and m.user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('owner','admin')
  )
);

-- Comments
comment on table public.companies is 'Company-level CRM records with enrichment data';
comment on column public.companies.domain is 'Unique domain identifier (e.g., example.com)';
comment on column public.companies.tech_stack is 'Array of technology names (e.g., ["AWS", "React", "Stripe"])';
comment on column public.companies.notes is 'Array of note objects for company history';












