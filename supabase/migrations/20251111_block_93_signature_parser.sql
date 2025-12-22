-- 1) Normalized fact bag (append-only; latest wins in views)
create table if not exists public.signature_facts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source text not null default 'signature_v2',
  phone text,
  title text,
  company text,
  location text,
  tz_hint text,
  website text,
  socials jsonb not null default '{}'::jsonb,
  fullname text,
  raw jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0.8
);

create index if not exists idx_sigfacts_lead on public.signature_facts(lead_id, created_at desc);

alter table public.signature_facts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'signature_facts'
      and policyname = 'sigfacts_iso'
  ) then
    create policy sigfacts_iso on public.signature_facts
      using (account_id = auth.uid());
  end if;
end $$;

-- 2) Lead enrichment columns (idempotent)
do $$
begin
  alter table public.leads add column if not exists phone text;
  alter table public.leads add column if not exists title text;
  alter table public.leads add column if not exists timezone text;
  alter table public.leads add column if not exists linkedin_url text;
  alter table public.leads add column if not exists twitter_url text;
  alter table public.leads add column if not exists website text;
exception
  when duplicate_column then
    null;
end $$;

-- 3) Best-current facts view (latest non-null wins)
create or replace view public.v_signature_best as
select
  sf.lead_id,
  (
    select fullname
    from signature_facts s
    where s.lead_id = sf.lead_id
      and s.fullname is not null
    order by s.created_at desc
    limit 1
  ) as fullname,
  (
    select phone
    from signature_facts s
    where s.lead_id = sf.lead_id
      and s.phone is not null
    order by s.created_at desc
    limit 1
  ) as phone,
  (
    select title
    from signature_facts s
    where s.lead_id = sf.lead_id
      and s.title is not null
    order by s.created_at desc
    limit 1
  ) as title,
  (
    select company
    from signature_facts s
    where s.lead_id = sf.lead_id
      and s.company is not null
    order by s.created_at desc
    limit 1
  ) as company,
  (
    select location
    from signature_facts s
    where s.lead_id = sf.lead_id
      and s.location is not null
    order by s.created_at desc
    limit 1
  ) as location,
  (
    select tz_hint
    from signature_facts s
    where s.lead_id = sf.lead_id
      and s.tz_hint is not null
    order by s.created_at desc
    limit 1
  ) as tz_hint,
  (
    select website
    from signature_facts s
    where s.lead_id = sf.lead_id
      and s.website is not null
    order by s.created_at desc
    limit 1
  ) as website,
  (
    select s.socials->>'linkedin'
    from signature_facts s
    where s.lead_id = sf.lead_id
      and s.socials ? 'linkedin'
    order by s.created_at desc
    limit 1
  ) as linkedin_url,
  (
    select s.socials->>'twitter'
    from signature_facts s
    where s.lead_id = sf.lead_id
      and s.socials ? 'twitter'
    order by s.created_at desc
    limit 1
  ) as twitter_url
from public.signature_facts sf
group by sf.lead_id;

-- 4) Optional: merge best facts into leads (safe upsert RPC)
create or replace function public.rpc_merge_signature_into_lead(p_lead_id uuid)
returns void
language plpgsql
as $$
declare
  b record;
begin
  select *
  into b
  from public.v_signature_best
  where lead_id = p_lead_id;

  if not found then
    return;
  end if;

  update public.leads
  set
    phone = coalesce(b.phone, leads.phone),
    title = coalesce(b.title, leads.title),
    company_name = coalesce(b.company, leads.company_name),
    timezone = coalesce(b.tz_hint, leads.timezone),
    website = coalesce(b.website, leads.website),
    linkedin_url = coalesce(b.linkedin_url, leads.linkedin_url),
    twitter_url = coalesce(b.twitter_url, leads.twitter_url),
    updated_at = now()
  where id = p_lead_id;
end $$;

