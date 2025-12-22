-- Block 329 — Lead Notes & Activity Logging v1
-- Pinned notes in Lead 360° + timeline events

-- Create lead_notes table if it doesn't exist
create table if not exists lead_notes (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  body text not null,
  pinned boolean not null default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add workspace_id column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
    and table_name = 'lead_notes'
    and column_name = 'workspace_id'
  ) then
    alter table lead_notes add column workspace_id uuid references workspaces(id) on delete cascade;
    -- Backfill workspace_id from leads table
    update lead_notes
    set workspace_id = (
      select workspace_id from leads where leads.id = lead_notes.lead_id
    )
    where workspace_id is null;
    -- Make it not null after backfill
    alter table lead_notes alter column workspace_id set not null;
  end if;
end $$;

-- Add pinned column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
    and table_name = 'lead_notes'
    and column_name = 'pinned'
  ) then
    alter table lead_notes add column pinned boolean not null default false;
  end if;
end $$;

-- Ensure user_id is not null (if it was nullable before)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
    and table_name = 'lead_notes'
    and column_name = 'user_id'
    and is_nullable = 'YES'
  ) then
    -- Set a default user_id for existing nulls (or handle as needed)
    -- For now, we'll just make it not null going forward
    alter table lead_notes alter column user_id set not null;
  end if;
end $$;

-- Create indexes
create index if not exists lead_notes_workspace_lead_idx
  on lead_notes (workspace_id, lead_id);

create index if not exists lead_notes_workspace_user_idx
  on lead_notes (workspace_id, user_id);

-- Trigger function for updated_at
create or replace function set_lead_notes_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lead_notes_updated_at on lead_notes;

create trigger trg_lead_notes_updated_at
before update on lead_notes
for each row
execute procedure set_lead_notes_updated_at();






