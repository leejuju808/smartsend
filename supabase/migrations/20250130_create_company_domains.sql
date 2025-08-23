-- Company Domains for Auto-Join
-- Allows teams to claim company domains and auto-join users with matching email domains

create table if not exists public.company_domains (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  domain text not null unique,
  verified boolean default false,
  verify_token text,                    -- random token for DNS TXT
  created_at timestamptz default now(),
  verified_at timestamptz
);

create index if not exists idx_company_domains_team on public.company_domains(team_id);
create index if not exists idx_company_domains_domain on public.company_domains(domain);

-- Enable RLS
alter table if exists public.company_domains enable row level security;

-- RLS policies
create policy "team_members_can_view_domains" on public.company_domains
  for select using (
    exists (
      select 1 from public.team_members m
      where m.team_id = company_domains.team_id and m.user_id = auth.uid()
    )
  );

create policy "team_owners_can_manage_domains" on public.company_domains
  for all using (
    exists (
      select 1 from public.teams t
      where t.id = company_domains.team_id and t.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.teams t
      where t.id = company_domains.team_id and t.owner_id = auth.uid()
    )
  ); 