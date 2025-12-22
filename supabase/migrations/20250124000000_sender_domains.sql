-- Sender Domains: Domain authentication verification (SPF, DKIM, DMARC)
-- SmartSend — Deliverability Dashboard

create table if not exists public.sender_domains (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  domain text not null,
  spf_pass boolean default false,
  dkim_pass boolean default false,
  dmarc_pass boolean default false,
  last_checked timestamptz,
  health_score numeric default 0,
  created_at timestamptz default now(),
  unique(team_id, domain)
);

-- Indexes
create index if not exists idx_sender_domains_team on public.sender_domains(team_id);
create index if not exists idx_sender_domains_domain on public.sender_domains(domain);
create index if not exists idx_sender_domains_last_checked on public.sender_domains(last_checked);

-- Enable RLS
alter table public.sender_domains enable row level security;

-- RLS: Team members can read domains
create policy "domains team read" on public.sender_domains
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = sender_domains.team_id
      and tm.user_id = auth.uid()
    )
  );

-- RLS: Team admins/owners can write
create policy "domains team write" on public.sender_domains
  for all using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = sender_domains.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
    )
  ) with check (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = sender_domains.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
    )
  );

-- Service role full access
create policy "service_role_domains" on public.sender_domains
  for all to service_role using (true) with check (true);

-- Function to extract domain from email
create or replace function public.extract_domain_from_email(email_address text)
returns text
language sql
immutable
as $$
  select lower(split_part(email_address, '@', 2));
$$;

-- Trigger function to auto-insert domain when sender_profile is created
create or replace function public.auto_insert_sender_domain()
returns trigger
language plpgsql
security definer
as $$
declare
  v_domain text;
  v_team_id uuid;
begin
  -- Extract domain from email
  v_domain := public.extract_domain_from_email(new.email);
  
  if v_domain is null or v_domain = '' then
    return new;
  end if;
  
  -- Get team_id from user (via first team membership)
  select tm.team_id into v_team_id
  from public.team_members tm
  where tm.user_id = new.user_id
  limit 1;
  
  -- If no team found, try to get from profiles table if it has team_id
  if v_team_id is null then
    select p.team_id into v_team_id
    from public.profiles p
    where p.id = new.user_id
    limit 1;
  end if;
  
  -- Insert domain if team_id found and domain doesn't exist
  if v_team_id is not null then
    insert into public.sender_domains (team_id, domain, spf_pass, dkim_pass, dmarc_pass, health_score)
    values (v_team_id, v_domain, false, false, false, 0)
    on conflict (team_id, domain) do nothing;
  end if;
  
  return new;
end;
$$;

-- Create trigger on sender_profiles
drop trigger if exists trigger_auto_insert_sender_domain on public.sender_profiles;
create trigger trigger_auto_insert_sender_domain
  after insert on public.sender_profiles
  for each row
  execute function public.auto_insert_sender_domain();

comment on table public.sender_domains is 'Domain authentication records (SPF, DKIM, DMARC) for deliverability monitoring';

