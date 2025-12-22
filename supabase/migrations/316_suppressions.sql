-- Block 316 — Unsubscribe & Suppression System v1
-- Per-workspace suppression list, lead unsubscribed flag, and send guards

-- ============================================================================
-- 1. EMAIL_SUPPRESSIONS TABLE
-- ============================================================================

create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  reason text,                -- e.g. "unsubscribe_link", "manual", "bounce", "complaint"
  source text,                -- e.g. "user", "system", "lead"
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_at timestamptz default now()
);

-- Unique constraint: one suppression per workspace+email
-- Using a unique index with lower() function for case-insensitive matching
create unique index if not exists email_suppressions_workspace_email_idx
  on public.email_suppressions (workspace_id, lower(email));

-- Index for campaign lookups
create index if not exists email_suppressions_campaign_idx
  on public.email_suppressions (campaign_id);

-- Index for workspace lookups
create index if not exists email_suppressions_workspace_idx
  on public.email_suppressions (workspace_id);

-- ============================================================================
-- 2. LEAD-LEVEL UNSUBSCRIBED FLAG
-- ============================================================================

-- Add unsubscribed flag if not exists
alter table public.leads
  add column if not exists unsubscribed boolean default false,
  add column if not exists unsubscribed_at timestamptz;

-- Index for quick lookups
create index if not exists idx_leads_unsubscribed
  on public.leads (workspace_id, unsubscribed)
  where unsubscribed = true;

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

alter table public.email_suppressions enable row level security;

-- Policy: workspace members can view suppressions for their workspace
create policy "workspace_members_can_view_suppressions"
  on public.email_suppressions
  for select
  using (
    workspace_id in (
      select workspace_id 
      from public.workspace_members 
      where user_id = auth.uid() 
      and status = 'active'
    )
  );

-- Policy: workspace members can insert suppressions for their workspace
create policy "workspace_members_can_insert_suppressions"
  on public.email_suppressions
  for insert
  with check (
    workspace_id in (
      select workspace_id 
      from public.workspace_members 
      where user_id = auth.uid() 
      and status = 'active'
    )
  );

-- Policy: workspace members can delete suppressions for their workspace
create policy "workspace_members_can_delete_suppressions"
  on public.email_suppressions
  for delete
  using (
    workspace_id in (
      select workspace_id 
      from public.workspace_members 
      where user_id = auth.uid() 
      and status = 'active'
    )
  );

-- ============================================================================
-- 4. HELPER FUNCTION: Check if email is suppressed
-- ============================================================================

create or replace function public.is_email_suppressed(
  p_workspace_id uuid,
  p_email text
)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1
    from public.email_suppressions
    where workspace_id = p_workspace_id
      and lower(email) = lower(p_email)
  );
end;
$$;

grant execute on function public.is_email_suppressed(uuid, text) to authenticated;

