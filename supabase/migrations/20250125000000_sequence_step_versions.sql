-- Sequence Step Versions: Track AI-generated variants per step for A/B testing and audit

-- A) Create sequence_step_versions table
create table if not exists public.sequence_step_versions (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  step_id uuid not null references public.sequence_steps(id) on delete cascade,
  step_no int not null,  -- maps to step_number in sequence_steps
  owner_scope text not null check (owner_scope in ('user','org')),
  owner_id uuid not null,
  kind text not null default 'optimize' check (kind in ('optimize','rewrite','shorten','expand','tone')),
  params jsonb not null default '{}'::jsonb,     -- {tone,len,persona,goal}
  subject text default '',
  body_md text not null,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ssv_step on public.sequence_step_versions(step_id, created_at desc);
create index if not exists idx_ssv_sequence on public.sequence_step_versions(sequence_id, step_no);

-- B) Add optional scoring fields to sequence_steps for quick UI cues
alter table public.sequence_steps
  add column if not exists ai_score int,                 -- 0-100 heuristic
  add column if not exists ai_notes text,                -- brief reason
  add column if not exists last_optimized_at timestamptz;

-- C) RLS policies for sequence_step_versions
alter table public.sequence_step_versions enable row level security;

create policy "ssv.select.mine"
on public.sequence_step_versions for select
using (
  (owner_scope='user' and owner_id=auth.uid())
  or (owner_scope='org' and public.can_view_org(owner_id))
);

create policy "ssv.insert.mine"
on public.sequence_step_versions for insert
with check (
  (owner_scope='user' and owner_id=auth.uid())
  or (owner_scope='org' and public.can_edit_org(owner_id))
);

