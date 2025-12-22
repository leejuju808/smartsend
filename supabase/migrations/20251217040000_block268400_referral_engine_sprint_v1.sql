-- BLOCK 268400 — SmartSend Expansion Sprint: Roofer Referral Engine (v1)
-- - Capture "Referred by" on signup (optional)
-- - Quiet status signal: SmartSend Active Since (timestamp)
-- - One-click "Show this to my friend" share token for read-only numbers view

-- =========================================================
-- 1) Profiles: referred_by (optional free-text)
-- =========================================================
alter table public.profiles
  add column if not exists referred_by text;

comment on column public.profiles.referred_by is
  'Block 268400: Optional free-text referral attribution captured at signup (e.g. "Mike in Dallas").';

-- =========================================================
-- 2) Workspaces: smartsend_active_since (quiet status signal)
-- =========================================================
alter table public.workspaces
  add column if not exists smartsend_active_since timestamptz;

comment on column public.workspaces.smartsend_active_since is
  'Block 268400: First activation timestamp (set when first campaign goes live / first real use).';

create index if not exists idx_workspaces_smartsend_active_since
  on public.workspaces(smartsend_active_since)
  where smartsend_active_since is not null;

-- =========================================================
-- 3) Workspace Proof Shares: public token -> read-only numbers view
-- =========================================================
create table if not exists public.workspace_proof_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0
);

create unique index if not exists workspace_proof_shares_token_uq
  on public.workspace_proof_shares(token);

create index if not exists workspace_proof_shares_workspace_idx
  on public.workspace_proof_shares(workspace_id, created_at desc);

alter table public.workspace_proof_shares enable row level security;

-- Workspace members can manage their own workspace share tokens
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_proof_shares'
      and policyname = 'workspace_proof_shares_member_rw'
  ) then
    create policy "workspace_proof_shares_member_rw"
      on public.workspace_proof_shares
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = workspace_proof_shares.workspace_id
            and wm.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = workspace_proof_shares.workspace_id
            and wm.user_id = auth.uid()
        )
      );
  end if;
end $$;

grant select, insert, update, delete on public.workspace_proof_shares to authenticated;
grant all on public.workspace_proof_shares to service_role;








