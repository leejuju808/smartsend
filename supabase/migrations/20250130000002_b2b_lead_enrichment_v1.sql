-- Block 431 — B2B Lead Enrichment v1
-- Creates lead_enrichment table with flat columns for structured enrichment data

create table if not exists public.lead_enrichment (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  
  -- Person
  first_name text,
  last_name text,
  full_name text,
  title text,
  seniority text,
  linkedin text,
  city text,
  state text,
  country text,
  timezone text,

  -- Company
  company text,
  domain text,
  website text,
  industry text,
  employee_count int,
  employee_range text,
  revenue text,
  founded_year int,

  -- Tech
  tech_stack text[],

  -- Meta
  source text,
  enriched_at timestamptz default now(),
  quality_score int
);

-- Indexes for fast lookups
create index if not exists idx_enriched_company on public.lead_enrichment(company);
create index if not exists idx_enriched_domain on public.lead_enrichment(domain);
create index if not exists idx_enriched_quality_score on public.lead_enrichment(quality_score);

-- RLS policies (mirror leads table access)
alter table public.lead_enrichment enable row level security;

-- Policy: Users can read/write enrichment for leads they have access to
-- Note: Adjust this based on your actual RLS pattern for leads table
do $$
begin
  create policy lead_enrichment_select on public.lead_enrichment
    for select using (
      exists (
        select 1 from public.leads l
        where l.id = lead_enrichment.lead_id
        -- Add your RLS condition here based on your leads table RLS
        -- Example: and (l.user_id = auth.uid() or l.team_id in (select team_id from team_members where user_id = auth.uid()))
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy lead_enrichment_insert on public.lead_enrichment
    for insert with check (
      exists (
        select 1 from public.leads l
        where l.id = lead_enrichment.lead_id
        -- Add your RLS condition here
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy lead_enrichment_update on public.lead_enrichment
    for update using (
      exists (
        select 1 from public.leads l
        where l.id = lead_enrichment.lead_id
        -- Add your RLS condition here
      )
    );
exception
  when duplicate_object then null;
end $$;

-- Function to compute quality score
create or replace function public.compute_enrichment_quality_score(e public.lead_enrichment)
returns int
language sql
immutable
as $$
  select 
    case when e.title is not null then 10 else 0 end +
    case when e.linkedin is not null then 10 else 0 end +
    case when e.employee_count is not null or e.employee_range is not null then 10 else 0 end +
    case when e.city is not null or e.state is not null then 10 else 0 end +
    case when e.industry is not null then 10 else 0 end +
    case when e.tech_stack is not null and array_length(e.tech_stack, 1) > 0 then 10 else 0 end;
$$;

-- Trigger to auto-compute quality score on insert/update
create or replace function public.update_enrichment_quality_score()
returns trigger
language plpgsql
as $$
begin
  new.quality_score := public.compute_enrichment_quality_score(new);
  return new;
end;
$$;

drop trigger if exists trg_enrichment_quality_score on public.lead_enrichment;
create trigger trg_enrichment_quality_score
before insert or update on public.lead_enrichment
for each row
execute function public.update_enrichment_quality_score();

-- Helper function to extract domain from email
create or replace function public.extract_domain_from_email(email_address text)
returns text
language sql
immutable
as $$
  select lower(split_part(email_address, '@', 2));
$$;



