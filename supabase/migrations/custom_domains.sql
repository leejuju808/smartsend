-- Custom Domains and DNS Records Schema
create table if not exists public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  hostname text not null,               -- e.g., send.acme.com
  tracking_subdomain text not null,     -- e.g., send
  root_domain text not null,            -- e.g., acme.com
  status text not null default 'pending', -- pending|verified|failed
  created_at timestamptz default now(),
  verified_at timestamptz
);

create unique index if not exists ux_domains_ws_host on public.custom_domains(workspace_id, hostname);

create table if not exists public.domain_dns_records (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.custom_domains(id) on delete cascade,
  type text not null check (type in ('CNAME','TXT')),
  host text not null,   -- e.g., send.acme.com / smartsend._domainkey.acme.com / smartsend-verify.acme.com
  value text not null,  -- target or txt value
  required boolean not null default true,
  verified boolean not null default false,
  created_at timestamptz default now()
);

-- RLS
alter table public.custom_domains enable row level security;
alter table public.domain_dns_records enable row level security;

create policy "domain read" on public.custom_domains
for select using (public.is_workspace_member(workspace_id));

create policy "domain write" on public.custom_domains
for insert with check (public.has_ws_role(workspace_id,'editor'))
, for update using (public.has_ws_role(workspace_id,'editor'))
, for delete using (public.has_ws_role(workspace_id,'admin'));

create policy "domain rec read" on public.domain_dns_records
for select using (exists (select 1 from public.custom_domains d where d.id = domain_id and public.is_workspace_member(d.workspace_id)));

create policy "domain rec write" on public.domain_dns_records
for all using (exists (select 1 from public.custom_domains d where d.id = domain_id and public.has_ws_role(d.workspace_id,'editor'))); 