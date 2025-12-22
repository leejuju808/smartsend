-- Block 482 — AI SDR Playbooks & Tone Profiles (Persona-Aware Replies)
-- Goal: Let you tell the AI how you sell for each campaign: target persona, messaging angle, tone, objections handling, etc.
-- Then wire that into draft replies, NBM, and executor, so the SDR brain doesn't just "sound good" — it sounds like your playbook.

-- ============================================================================
-- 1️⃣ Create ai_sdr_playbooks table
-- ============================================================================

create table if not exists public.ai_sdr_playbooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  description text,

  -- e.g. "US-based home services owners", "B2B SaaS founders 10–50 employees"
  target_persona text,

  -- High-level goal: "book 15-minute demo", "get reply with interest", etc.
  primary_goal text,

  -- How aggressive/soft to be: "soft", "balanced", "direct"
  approach_style text check (approach_style in ('soft','balanced','direct'))
    default 'balanced',

  -- JSON with structured hints: industries, roles, pain points, etc.
  config jsonb default '{}',

  -- Long-form guidelines that become part of system prompt
  messaging_guidelines text,
  objection_handling_guidelines text,
  closing_style text,  -- e.g. "always propose 2 times", "ask open-ended question"

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ai_sdr_playbooks_user
  on public.ai_sdr_playbooks (user_id);

-- ============================================================================
-- 2️⃣ Add playbook reference to campaigns
-- ============================================================================

alter table public.campaigns
  add column if not exists ai_sdr_playbook_id uuid
    references public.ai_sdr_playbooks(id) on delete set null;

create index if not exists idx_campaigns_ai_sdr_playbook
  on public.campaigns (ai_sdr_playbook_id);

-- ============================================================================
-- 3️⃣ Extend user_settings table with tone/profile fields
-- ============================================================================

-- Ensure user_settings table exists (may already exist from previous migrations)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add new columns if they don't exist
alter table public.user_settings
  add column if not exists email_tone text check (email_tone in ('professional','casual','warm','direct'))
    default 'professional',
  add column if not exists default_signoff text,       -- e.g. "Best, Julian"
  add column if not exists company_name text,
  add column if not exists role_title text,            -- e.g. "Founder, SmartSend AI"
  add column if not exists website_url text;

-- Preserve existing columns if they exist (signature_html from previous migrations)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'user_settings' 
    and column_name = 'signature_html'
  ) then
    alter table public.user_settings add column signature_html text;
  end if;
end $$;

-- ============================================================================
-- 4️⃣ RLS Policies
-- ============================================================================

alter table public.ai_sdr_playbooks enable row level security;

-- Drop existing policy if it exists, then create new one
drop policy if exists "user manages their playbooks" on public.ai_sdr_playbooks;

create policy "user manages their playbooks"
  on public.ai_sdr_playbooks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Ensure user_settings RLS is enabled
alter table public.user_settings enable row level security;

-- Drop existing policy if it exists, then create new one
drop policy if exists "user manages their settings" on public.user_settings;

create policy "user manages their settings"
  on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 5️⃣ Update trigger for updated_at
-- ============================================================================

-- Create or replace function for updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Add updated_at trigger to ai_sdr_playbooks
drop trigger if exists trg_ai_sdr_playbooks_updated_at on public.ai_sdr_playbooks;
create trigger trg_ai_sdr_playbooks_updated_at
  before update on public.ai_sdr_playbooks
  for each row
  execute function public.set_updated_at();

-- Add updated_at trigger to user_settings if it doesn't exist
drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at
  before update on public.user_settings
  for each row
  execute function public.set_updated_at();


