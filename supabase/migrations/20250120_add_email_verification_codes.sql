-- Add email verification codes table for domain verification
create table if not exists public.company_domain_email_verifications (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  used boolean default false,
  created_by uuid not null,         -- requester user id
  created_at timestamptz default now()
);

create index if not exists idx_cdev_domain on public.company_domain_email_verifications(domain);
create index if not exists idx_cdev_email on public.company_domain_email_verifications(email);
create index if not exists idx_cdev_expires on public.company_domain_email_verifications(expires_at);
create index if not exists idx_cdev_used on public.company_domain_email_verifications(used);

-- Enable RLS
alter table public.company_domain_email_verifications enable row level security;

-- RLS policies (only admins can view their team's verifications)
create policy "Team admins can view domain verifications" on public.company_domain_email_verifications
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
      and tm.team_id = (
        select cd.team_id from public.company_domains cd
        where cd.domain = company_domain_email_verifications.domain
      )
    )
  );

create policy "Team admins can insert domain verifications" on public.company_domain_email_verifications
  for insert with check (
    exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
      and tm.team_id = (
        select cd.team_id from public.company_domains cd
        where cd.domain = company_domain_email_verifications.domain
      )
    )
  );

create policy "Team admins can update domain verifications" on public.company_domain_email_verifications
  for update using (
    exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
      and tm.team_id = (
        select cd.team_id from public.company_domains cd
        where cd.domain = company_domain_email_verifications.domain
      )
    )
  );
