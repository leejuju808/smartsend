-- Block 12200 — First-Campaign Onboarding Wizard v1
-- Guided Setup + "Go Live in 15 Minutes" Flow
-- Creates onboarding state tracking and completion flags

-- ============================================================================
-- 1. ONBOARDING_STATE TABLE
-- ============================================================================

create table if not exists public.onboarding_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  step int not null default 1 check (step >= 1 and step <= 7),
  data jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, org_id)
);

-- Indexes
create index if not exists idx_onboarding_state_user on public.onboarding_state(user_id);
create index if not exists idx_onboarding_state_org on public.onboarding_state(org_id);
create index if not exists idx_onboarding_state_completed on public.onboarding_state(completed_at) where completed_at is not null;

-- Update trigger
create or replace function update_onboarding_state_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_onboarding_state_updated_at
before update on public.onboarding_state
for each row
execute function update_onboarding_state_updated_at();

-- ============================================================================
-- 2. ADD ONBOARDING COMPLETED FLAG TO PROFILES
-- ============================================================================

alter table public.profiles
  add column if not exists onboarding_completed boolean default false,
  add column if not exists onboarding_completed_at timestamptz;

create index if not exists idx_profiles_onboarding_completed 
  on public.profiles(onboarding_completed) 
  where onboarding_completed = false;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

alter table public.onboarding_state enable row level security;

-- Users can read/write their own onboarding state
create policy "onboarding_state_select_own"
  on public.onboarding_state for select
  using (auth.uid() = user_id);

create policy "onboarding_state_insert_own"
  on public.onboarding_state for insert
  with check (auth.uid() = user_id);

create policy "onboarding_state_update_own"
  on public.onboarding_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 4. HELPER FUNCTION: Get or create onboarding state
-- ============================================================================

create or replace function public.get_or_create_onboarding_state(
  p_user_id uuid,
  p_org_id uuid
)
returns public.onboarding_state
language plpgsql
security definer
as $$
declare
  v_state public.onboarding_state;
begin
  -- Try to get existing state
  select * into v_state
  from public.onboarding_state
  where user_id = p_user_id
    and (org_id = p_org_id or (org_id is null and p_org_id is null))
  limit 1;

  -- If not found, create new state
  if v_state is null then
    insert into public.onboarding_state (user_id, org_id, step, data)
    values (p_user_id, p_org_id, 1, '{}'::jsonb)
    returning * into v_state;
  end if;

  return v_state;
end;
$$;




























































