-- Block 423 — Multi-Domain Sender Management v1
-- Multi-domain sending system with DNS verification and inbox management

-- ============================================
-- 1) Sender Domains Table
-- ============================================
create table if not exists public.sender_domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain text not null,
  spf_valid boolean default false,
  dkim_valid boolean default false,
  dmarc_valid boolean default false,
  mx_valid boolean default false,
  health text default 'poor' check (health in ('excellent', 'good', 'poor')),
  last_check timestamptz,
  created_at timestamptz default now(),
  unique(workspace_id, domain)
);

create index if not exists idx_sender_domains_workspace on public.sender_domains(workspace_id);
create index if not exists idx_sender_domains_domain on public.sender_domains(domain);

-- ============================================
-- 2) Sender Inboxes Table
-- ============================================
create table if not exists public.sender_inboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain_id uuid not null references public.sender_domains(id) on delete cascade,
  email text not null,
  provider text not null check (provider in ('gmail', 'outlook', 'smtp')),
  oauth_token jsonb,
  smtp_config jsonb,
  daily_limit int default 100,
  warmup_enabled boolean default false,
  connected boolean default false,
  last_checked timestamptz,
  created_at timestamptz default now(),
  unique(domain_id, email)
);

create index if not exists idx_sender_inboxes_workspace on public.sender_inboxes(workspace_id);
create index if not exists idx_sender_inboxes_domain on public.sender_inboxes(domain_id);
create index if not exists idx_sender_inboxes_email on public.sender_inboxes(email);

-- ============================================
-- 3) Add sender_inbox_id to campaign_steps
-- ============================================
alter table if exists public.campaign_steps 
  add column if not exists sender_inbox_id uuid references public.sender_inboxes(id) on delete set null;

create index if not exists idx_campaign_steps_sender_inbox on public.campaign_steps(sender_inbox_id);

-- ============================================
-- 4) Enable RLS
-- ============================================
alter table public.sender_domains enable row level security;
alter table public.sender_inboxes enable row level security;

-- ============================================
-- 5) RLS Policies for sender_domains
-- ============================================
create policy "sender_domains_select_workspace_member" on public.sender_domains
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = sender_domains.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "sender_domains_insert_workspace_member" on public.sender_domains
  for insert with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = sender_domains.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "sender_domains_update_workspace_member" on public.sender_domains
  for update using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = sender_domains.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "sender_domains_delete_workspace_member" on public.sender_domains
  for delete using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = sender_domains.workspace_id
        and user_id = auth.uid()
    )
  );

-- ============================================
-- 6) RLS Policies for sender_inboxes
-- ============================================
create policy "sender_inboxes_select_workspace_member" on public.sender_inboxes
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = sender_inboxes.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "sender_inboxes_insert_workspace_member" on public.sender_inboxes
  for insert with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = sender_inboxes.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "sender_inboxes_update_workspace_member" on public.sender_inboxes
  for update using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = sender_inboxes.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "sender_inboxes_delete_workspace_member" on public.sender_inboxes
  for delete using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = sender_inboxes.workspace_id
        and user_id = auth.uid()
    )
  );

-- ============================================
-- 7) Helper function to get workspace_id from user
-- ============================================
create or replace function public.get_user_workspace_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select workspace_id
  from public.workspace_members
  where user_id = auth.uid()
  limit 1;
$$;



