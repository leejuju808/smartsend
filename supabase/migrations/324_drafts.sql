-- Block 324: Auto-Save Drafts v1
-- Generic drafts table for auto-saving templates, steps, inbox replies, and notes

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  draft_type text not null,   -- e.g. 'sequence_step', 'template', 'lead_note', 'meeting_note'
  entity_id uuid,             -- step_id, template_id, lead_id, meeting_id, etc.

  content jsonb not null,     -- flexible payload
  updated_at timestamptz default now()
);

create index if not exists drafts_workspace_user_type_idx
  on drafts (workspace_id, user_id, draft_type);

create index if not exists drafts_entity_idx
  on drafts (entity_id);

-- Unique constraint to prevent duplicate drafts for same workspace/user/type/entity
-- For non-null entity_id: unique on (workspace_id, user_id, draft_type, entity_id)
-- For null entity_id: unique on (workspace_id, user_id, draft_type) where entity_id is null
create unique index if not exists drafts_unique_with_entity_idx
  on drafts (workspace_id, user_id, draft_type, entity_id)
  where entity_id is not null;

create unique index if not exists drafts_unique_without_entity_idx
  on drafts (workspace_id, user_id, draft_type)
  where entity_id is null;

-- Trigger for updated_at
create or replace function set_drafts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_drafts_updated_at on drafts;

create trigger trg_drafts_updated_at
before update on drafts
for each row
execute procedure set_drafts_updated_at();

-- RLS policies
alter table drafts enable row level security;

-- Users can only see their own drafts
create policy "Users can view their own drafts"
  on drafts for select
  using (auth.uid() = user_id);

-- Users can insert their own drafts
create policy "Users can insert their own drafts"
  on drafts for insert
  with check (auth.uid() = user_id);

-- Users can update their own drafts
create policy "Users can update their own drafts"
  on drafts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own drafts
create policy "Users can delete their own drafts"
  on drafts for delete
  using (auth.uid() = user_id);

