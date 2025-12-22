-- Ensure required columns exist on leads table
alter table public.leads
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists email text not null default '',
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company text,
  add column if not exists status text not null default 'New',
  add column if not exists last_activity_at timestamptz;

-- Unique email per workspace (case-insensitive)
drop index if exists ux_leads_ws_email;
create unique index if not exists ux_leads_ws_email
  on public.leads (workspace_id, lower(email));

-- Fast lookup index
create index if not exists idx_leads_ws on public.leads(workspace_id);

-- RLS policies
alter table public.leads enable row level security;

drop policy if exists "leads_rw" on public.leads;
create policy "leads_rw" on public.leads
  for select using (public.is_workspace_member(workspace_id))
, for insert with check (public.is_workspace_member(workspace_id))
, for update using (public.is_workspace_member(workspace_id)); 