-- Links extracted from rendered email HTML (one row per link instance per job)
create table if not exists public.email_links (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.email_jobs(id) on delete cascade,
  workspace_id uuid not null,
  url text not null,                 -- original destination
  token text not null unique,        -- opaque redirect token
  position int not null default 0,   -- nth link in the body for this job
  utm jsonb,                         -- utm params we appended to url (before wrapping)
  created_at timestamptz not null default now()
);

create index if not exists email_links_job_idx on public.email_links(job_id);
create index if not exists email_links_ws_idx  on public.email_links(workspace_id);

-- Clicks recorded via our redirect
create table if not exists public.email_clicks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.email_links(id) on delete cascade,
  job_id uuid not null references public.email_jobs(id) on delete cascade,
  workspace_id uuid not null,
  ip inet,
  user_agent text,
  referer text,
  created_at timestamptz not null default now()
);

create index if not exists email_clicks_job_idx on public.email_clicks(job_id);
create index if not exists email_clicks_link_idx on public.email_clicks(link_id);
create index if not exists email_clicks_ws_idx  on public.email_clicks(workspace_id);

alter table public.email_links  enable row level security;
alter table public.email_clicks enable row level security;

-- RLS: service role full access
create policy "service role full links" on public.email_links  as permissive for all to service_role using (true) with check (true);
create policy "service role full clicks"on public.email_clicks as permissive for all to service_role using (true) with check (true);

-- RLS: users can read rows for their workspace
create policy "users read links"  on public.email_links  for select to authenticated using (workspace_id = auth.uid());
create policy "users read clicks" on public.email_clicks for select to authenticated using (workspace_id = auth.uid());

-- Simple rollups
create or replace view public.v_link_clicks_by_url as
select
  l.workspace_id,
  j.campaign_id,
  l.url,
  count(c.*) as clicks
from public.email_links l
left join public.email_clicks c on c.link_id = l.id
left join public.email_jobs j on j.id = l.job_id
group by 1,2,3;

alter view public.v_link_clicks_by_url set (security_invoker = on);