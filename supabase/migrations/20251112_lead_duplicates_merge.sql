-- Lead duplicate detection helper view and merge audit log
create extension if not exists pg_trgm;

alter table public.leads
  add column if not exists merged_into uuid references public.leads(id) on delete set null;

alter table public.leads
  drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check check (
    status in (
      'Queued','Sending','Sent','Bounced','Replied','Archived',
      'new','queued','replied','unsubscribed','bounced','sending','sent','failed',
      'merged','Merged'
    )
  );

create or replace view public.lead_duplicates as
select
  l1.id as lead_id,
  l2.id as duplicate_id,
  l1.name as lead_name,
  l2.name as duplicate_name,
  l1.first_name as lead_first_name,
  l1.last_name as lead_last_name,
  l2.first_name as duplicate_first_name,
  l2.last_name as duplicate_last_name,
  l1.company as lead_company,
  l2.company as duplicate_company,
  l1.email,
  l2.email as dup_email,
  similarity(lower(l1.name), lower(l2.name)) as name_score,
  similarity(lower(coalesce(l1.company, '')), lower(coalesce(l2.company, ''))) as company_score,
  case
    when lower(l1.email) = lower(l2.email) then 'email'
    when split_part(l1.email, '@', 2) = split_part(l2.email, '@', 2)
         and similarity(lower(l1.name), lower(l2.name)) > 0.85
         and similarity(lower(coalesce(l1.company, '')), lower(coalesce(l2.company, ''))) > 0.75 then 'fuzzy_domain'
    else 'none'
  end as reason
from public.leads l1
join public.leads l2 on l1.id <> l2.id
where
  lower(l1.email) = lower(l2.email)
  or (
    split_part(l1.email, '@', 2) = split_part(l2.email, '@', 2)
    and similarity(lower(l1.name), lower(l2.name)) > 0.85
    and similarity(lower(coalesce(l1.company, '')), lower(coalesce(l2.company, ''))) > 0.75
  );


create table if not exists public.lead_merges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  master_lead_id uuid not null references public.leads(id) on delete cascade,
  merged_lead_id uuid not null references public.leads(id) on delete cascade,
  reason text,
  merged_by uuid references auth.users(id),
  unique (master_lead_id, merged_lead_id)
);

