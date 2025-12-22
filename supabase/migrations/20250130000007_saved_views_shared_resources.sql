-- Block 132 — Saved Views on Lead List
-- Extend shared_resources for saved views

-- 1) Config payload for saved views / presets
alter table public.shared_resources
  add column if not exists config jsonb;

-- 2) What entity this saved view/preset applies to (leads, campaigns, etc.)
alter table public.shared_resources
  add column if not exists entity text;

-- 3) Add account_id column for account-scoped saved views
alter table public.shared_resources
  add column if not exists account_id uuid references auth.users(id) on delete cascade;

-- 4) Optional check constraint for entity types
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_resources_entity_check'
  ) then
    alter table public.shared_resources
    add constraint shared_resources_entity_check
    check (entity in ('leads', 'campaigns', 'emails'));
  end if;
end $$;

-- 5) Helpful index for fast lookup
create index if not exists idx_shared_resources_saved_view
on public.shared_resources (account_id, kind, entity);

-- 6) Update status constraint to include 'active' if needed
do $$
begin
  -- Check if 'active' is already in the status check constraint
  if not exists (
    select 1
    from pg_constraint c
    join pg_constraint con on con.conname = c.conname
    where c.conrelid = 'public.shared_resources'::regclass
    and c.conname like '%status%'
    and exists (
      select 1 from pg_get_constraintdef(c.oid) as def
      where def like '%active%'
    )
  ) then
    -- Drop existing constraint if it exists
    alter table public.shared_resources
    drop constraint if exists shared_resources_status_check;
    
    -- Add new constraint with 'active'
    alter table public.shared_resources
    add constraint shared_resources_status_check
    check (status in ('draft','published','archived','active'));
  end if;
end $$;














