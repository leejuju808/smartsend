-- Block 484 — AI Objection Playbooks + OTA (Objection Tactic Automation)
-- When an objection comes in, SmartSend doesn't just detect it — it runs a playbook tactic

-- ============================================================================
-- 1️⃣ Create Table: ai_sdr_objection_tactics
-- ============================================================================

create table if not exists public.ai_sdr_objection_tactics (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid references public.ai_sdr_playbooks(id) on delete cascade,

  -- optional global default if playbook_id is null
  user_id uuid not null references auth.users(id) on delete cascade,

  objection_type text not null check (objection_type in (
    'not_interested',
    'too_expensive',
    'no_budget',
    'bad_timing',
    'using_competitor',
    'not_decision_maker',
    'come_back_later',
    'send_info',
    'spam_complaint',
    'unclear',
    'other'
  )),

  -- what the system should do
  -- manual: suggest only
  -- auto_mute / auto_archive / auto_wait / auto_send_followup / auto_send_resource
  action text not null check (action in (
    'manual',
    'auto_mute',
    'auto_archive',
    'auto_wait',
    'auto_send_followup',
    'auto_send_resource'
  )),

  label text,          -- short label e.g. "Respectfully close, leave door open"
  description text,    -- human-readable summary

  auto_execute boolean not null default false,
  wait_days integer default 30,  -- for auto_wait

  -- Extra guidance for the email generator
  email_prompt_hint text,        -- e.g. "Acknowledge budget concerns, propose short call to scope"

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.ai_sdr_objection_tactics enable row level security;

create policy "user owns objection tactics"
  on public.ai_sdr_objection_tactics
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_ai_sdr_objection_tactics_user
  on public.ai_sdr_objection_tactics (user_id, objection_type);
create index if not exists idx_ai_sdr_objection_tactics_playbook
  on public.ai_sdr_objection_tactics (playbook_id, objection_type);

-- ============================================================================
-- 2️⃣ Extend ai_sdr_objections to track tactic usage
-- ============================================================================

alter table public.ai_sdr_objections
  add column if not exists tactic_action text,              -- what tactic was selected
  add column if not exists tactic_executed_at timestamptz,  -- when it actually ran
  add column if not exists tactic_notes text;               -- optional log/comment

-- ============================================================================
-- 3️⃣ Update trigger for updated_at
-- ============================================================================

drop trigger if exists trg_ai_sdr_objection_tactics_updated_at on public.ai_sdr_objection_tactics;
create trigger trg_ai_sdr_objection_tactics_updated_at
  before update on public.ai_sdr_objection_tactics
  for each row
  execute function public.set_updated_at();


