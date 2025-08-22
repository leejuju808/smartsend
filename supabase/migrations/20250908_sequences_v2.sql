-- Extend sequences, steps, and add sequence_runs

-- Ensure sequences has a human-friendly name
alter table if exists public.sequences
  add column if not exists name text;

-- Ensure sequence_steps can reference sequences and has delay_days
alter table if exists public.sequence_steps
  add column if not exists sequence_id uuid references public.sequences(id) on delete cascade;

alter table if exists public.sequence_steps
  add column if not exists delay_days int;

-- Backfill default delay for any existing rows then enforce not null
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sequence_steps' and column_name = 'delay_days'
  ) then
    update public.sequence_steps set delay_days = coalesce(delay_days, 0) where delay_days is null;
    alter table public.sequence_steps alter column delay_days set default 0;
    alter table public.sequence_steps alter column delay_days set not null;
  end if;
end $$;

-- Helpful index to ensure one row per (sequence, step)
create unique index if not exists sequence_steps_sequence_step_unique
  on public.sequence_steps(sequence_id, step_number)
  where sequence_id is not null;

-- Create sequence_runs to track per-contact progression through a sequence
create table if not exists public.sequence_runs (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references public.sequences(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  current_step int default 1,
  last_sent_at timestamptz,
  stopped boolean default false,
  created_at timestamptz default now()
);

create index if not exists sequence_runs_sequence_id_idx on public.sequence_runs(sequence_id);
create index if not exists sequence_runs_contact_id_idx on public.sequence_runs(contact_id);
create index if not exists sequence_runs_active_idx on public.sequence_runs(stopped, last_sent_at);

