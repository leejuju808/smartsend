-- Org-scoped suppression list
-- Tracks hard bounces, complaints, and manual suppressions per organization

create table if not exists public.suppression_list (
  org_id uuid not null references public.organizations(id) on delete cascade,
  email citext not null,
  reason text,               -- e.g., "hard_bounce", "complaint", "manual"
  source text,               -- e.g., "sendgrid", "postmark", "gmail-dsn", "manual"
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  primary key (org_id, email)
);

-- Enable citext extension if not already enabled
create extension if not exists citext;

-- Add indexes for performance
create index if not exists idx_supp_email on public.suppression_list (email);
create index if not exists idx_supp_org on public.suppression_list (org_id);
create index if not exists idx_supp_last_seen on public.suppression_list (last_seen_at desc);

-- Enable row level security
alter table public.suppression_list enable row level security;

-- RLS policies using existing is_org_member function
create policy "read my org suppressions" on public.suppression_list 
  for select using (is_org_member(org_id));

create policy "write my org suppressions" on public.suppression_list 
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Optional: quick view for dashboard
create or replace view public.suppression_stats as
select 
  org_id,
  count(*) as suppressed_count,
  count(*) filter (where reason = 'complaint') as complaints,
  count(*) filter (where reason = 'hard_bounce') as hard_bounces,
  count(*) filter (where reason = 'soft_bounce') as soft_bounces,
  count(*) filter (where reason = 'manual') as manual_suppressions
from public.suppression_list
group by org_id;

-- Grant access to view
grant select on public.suppression_stats to authenticated;

-- Add comment for documentation
comment on table public.suppression_list is 'Org-scoped suppression list for emails that should not be sent to';
comment on view public.suppression_stats is 'Aggregated suppression statistics per organization';

