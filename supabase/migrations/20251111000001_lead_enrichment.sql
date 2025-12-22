-- Lead enrichment cache, helper functions, and supporting indexes

-- A) Lead enrichment snapshot (per lead)
create table if not exists public.lead_enrichment (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  updated_at timestamptz not null default now(),
  source text,
  confidence real,
  person jsonb not null default '{}'::jsonb,
  company jsonb not null default '{}'::jsonb,
  tech jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  ttl_expires_at timestamptz
);

comment on column public.lead_enrichment.source is 'Data provider: clearbit, peopledb, hunter, builtwith, mixed';
comment on column public.lead_enrichment.confidence is 'Confidence score between 0 and 1';

-- B) Add normalized columns on leads (fast filters / display)
alter table public.leads
  add column if not exists title text,
  add column if not exists seniority text,
  add column if not exists company text,
  add column if not exists website text,
  add column if not exists domain text,
  add column if not exists linkedin text,
  add column if not exists company_size text,
  add column if not exists industry text,
  add column if not exists locality text;

-- C) Tech stack cache (1:N company-domain → tech slugs)
create table if not exists public.company_tech_cache (
  domain text primary key,
  updated_at timestamptz not null default now(),
  tech jsonb not null default '[]'::jsonb,
  ttl_expires_at timestamptz
);

-- D) Indexes
create index if not exists idx_leads_domain on public.leads(domain);
create index if not exists idx_leads_company on public.leads(company);
create index if not exists idx_lead_enrichment_ttl on public.lead_enrichment(ttl_expires_at);

-- E) RLS mirroring leads (lead-level access)
alter table public.lead_enrichment enable row level security;

do $$
begin
  create policy lead_enrichment_rw on public.lead_enrichment
    for all using (
      exists (
        select 1
        from public.leads l
        where l.id = lead_id
          and l.account_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.leads l
        where l.id = lead_id
          and l.account_id = auth.uid()
      )
    );
exception
  when duplicate_object then null;
end $$;

alter table public.company_tech_cache enable row level security;

do $$
begin
  create policy company_tech_cache_r on public.company_tech_cache
    for select using (true);
exception
  when duplicate_object then null;
end $$;

-- F) Helper — normalize domain from email/website
create or replace function public.extract_domain(p_email text, p_website text)
returns text
language sql
immutable
as $$
  with source(domain_raw) as (
    select coalesce(
      nullif(regexp_replace(coalesce(p_website, ''), '^https?://', ''), ''),
      split_part(coalesce(p_email, ''), '@', 2)
    )
  )
  select lower(
    regexp_replace(
      regexp_replace(domain_raw, '/.*$', ''),
      '^www\.',
      ''
    )
  )
  from source;
$$;

-- G) Upsert convenience: apply enrichment to leads row
create or replace function public.apply_lead_enrichment(p_lead uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  select * into e
  from public.lead_enrichment
  where lead_id = p_lead;

  if not found then
    return;
  end if;

  update public.leads
  set
    title        = coalesce(e.person->>'title', title),
    seniority    = coalesce(e.person->>'seniority', seniority),
    linkedin     = coalesce(e.person->>'linkedin', linkedin),
    company      = coalesce(e.company->>'name', company),
    website      = coalesce(e.company->>'website', website),
    domain       = coalesce(e.company->>'domain', domain),
    company_size = coalesce(e.company->>'size', company_size),
    industry     = coalesce(e.company->>'industry', industry),
    locality     = coalesce(e.company->>'locality', locality)
  where id = p_lead;
end;
$$;

-- H) List enrichment candidates (for batch jobs)
create or replace function public.list_enrichment_candidates(p_account uuid, p_limit int default 100)
returns table(id uuid)
language sql
security definer
set search_path = public
as $$
  select l.id
  from public.leads l
  left join public.lead_enrichment e on e.lead_id = l.id
  where l.account_id = coalesce(p_account, l.account_id)
    and (
      e.lead_id is null
      or e.ttl_expires_at is null
      or e.ttl_expires_at <= now()
    )
  order by coalesce(e.updated_at, to_timestamp(0)) asc
  limit coalesce(p_limit, 100);
$$;


