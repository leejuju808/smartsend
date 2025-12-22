-- Block 424 — Deliverability Health Dashboard v1
-- Domain Reputation • Inbox Health • Spam Risk • Warmup Metrics • Alerts

-- ============================================
-- 1) Domain Reputation Table
-- ============================================
create table if not exists public.domain_reputation (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.sender_domains(id) on delete cascade,
  reputation_score int default 50 check (reputation_score >= 0 and reputation_score <= 100),
  updated_at timestamptz default now(),
  unique(domain_id)
);

create index if not exists idx_domain_reputation_domain on public.domain_reputation(domain_id);
create index if not exists idx_domain_reputation_updated on public.domain_reputation(updated_at);

-- ============================================
-- 2) Inbox Health Table
-- ============================================
create table if not exists public.inbox_health (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sender_inboxes(id) on delete cascade,
  spam_rate float default 0,
  bounce_rate float default 0,
  open_rate float default 0,
  click_rate float default 0,
  warmup_stage int default 0,
  score int default 50 check (score >= 0 and score <= 100),
  updated_at timestamptz default now(),
  unique(inbox_id)
);

create index if not exists idx_inbox_health_inbox on public.inbox_health(inbox_id);
create index if not exists idx_inbox_health_updated on public.inbox_health(updated_at);
create index if not exists idx_inbox_health_score on public.inbox_health(score);

-- ============================================
-- 3) Workspace-Level Deliverability Stats
-- ============================================
create table if not exists public.workspace_deliverability (
  workspace_id uuid not null references public.workspaces(id) on delete cascade primary key,
  spam_rate float default 0,
  bounce_rate float default 0,
  avg_open_rate float default 0,
  avg_click_rate float default 0,
  updated_at timestamptz default now()
);

create index if not exists idx_workspace_deliverability_updated on public.workspace_deliverability(updated_at);

-- ============================================
-- 4) Enable RLS
-- ============================================
alter table public.domain_reputation enable row level security;
alter table public.inbox_health enable row level security;
alter table public.workspace_deliverability enable row level security;

-- ============================================
-- 5) RLS Policies for domain_reputation
-- ============================================
create policy "domain_reputation_select_workspace_member" on public.domain_reputation
  for select using (
    exists (
      select 1 from public.sender_domains sd
      join public.workspace_members wm on wm.workspace_id = sd.workspace_id
      where sd.id = domain_reputation.domain_id
        and wm.user_id = auth.uid()
    )
  );

create policy "domain_reputation_service_role" on public.domain_reputation
  for all to service_role using (true) with check (true);

-- ============================================
-- 6) RLS Policies for inbox_health
-- ============================================
create policy "inbox_health_select_workspace_member" on public.inbox_health
  for select using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = inbox_health.inbox_id
        and wm.user_id = auth.uid()
    )
  );

create policy "inbox_health_service_role" on public.inbox_health
  for all to service_role using (true) with check (true);

-- ============================================
-- 7) RLS Policies for workspace_deliverability
-- ============================================
create policy "workspace_deliverability_select_member" on public.workspace_deliverability
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_deliverability.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "workspace_deliverability_service_role" on public.workspace_deliverability
  for all to service_role using (true) with check (true);

-- ============================================
-- 8) Trigger to update updated_at
-- ============================================
create or replace function public.update_deliverability_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_domain_reputation_updated_at
  before update on public.domain_reputation
  for each row execute function public.update_deliverability_updated_at();

create trigger trg_inbox_health_updated_at
  before update on public.inbox_health
  for each row execute function public.update_deliverability_updated_at();

create trigger trg_workspace_deliverability_updated_at
  before update on public.workspace_deliverability
  for each row execute function public.update_deliverability_updated_at();



