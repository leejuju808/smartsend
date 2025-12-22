-- Public catalog (curated + community)
create table if not exists public.marketplace_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                   -- "sequence" | "campaign"
  name text not null,
  description text,
  tags text[] default '{}',
  rating numeric default 0,             -- avg 0..5
  installs int default 0,
  is_paid boolean default false,
  price_cents int default 0,
  author text,
  payload jsonb not null,               -- normalized template (steps, subjects, bodies)
  created_at timestamptz default now()
);

create index if not exists mkt_kind_idx on public.marketplace_templates(kind);
create index if not exists mkt_tags_gin on public.marketplace_templates using gin (tags);

-- Install audit
create table if not exists public.marketplace_installs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.marketplace_templates(id) on delete cascade,
  org_id uuid not null,
  user_id uuid not null,
  installed_kind text not null,         -- "sequence" | "campaign"
  installed_ref uuid,                   -- new local id
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.marketplace_templates enable row level security;
alter table public.marketplace_installs enable row level security;

-- RLS policies
create policy if not exists "marketplace_templates_select_all" on public.marketplace_templates for select using (true);
create policy if not exists "marketplace_templates_insert_admin" on public.marketplace_templates for insert with check (true); -- TODO: restrict to admins/authors
create policy if not exists "marketplace_templates_update_admin" on public.marketplace_templates for update using (true); -- TODO: restrict to admins/authors

create policy if not exists "marketplace_installs_select_own" on public.marketplace_installs for select using (auth.uid() = user_id);
create policy if not exists "marketplace_installs_insert_own" on public.marketplace_installs for insert with check (auth.uid() = user_id); 