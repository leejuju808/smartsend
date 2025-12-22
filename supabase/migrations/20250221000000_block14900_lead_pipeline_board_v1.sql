-- Block 14900 — Lead Pipeline Board v1
-- Drag-and-Drop Kanban for Roofing Leads
-- "See your money on one board"

-- ============================================================================
-- 1. CREATE PIPELINE_STAGES TABLE
-- ============================================================================

create table if not exists public.pipeline_stages (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null, -- 'new', 'attempting', 'warm', 'hot', 'won', 'lost'
  label text not null,
  position int not null, -- order left→right
  created_at timestamptz default now(),
  unique (workspace_id, key)
);

create index if not exists pipeline_stages_workspace_idx on public.pipeline_stages(workspace_id);
create index if not exists pipeline_stages_position_idx on public.pipeline_stages(workspace_id, position);

-- ============================================================================
-- 2. ADD PIPELINE_STAGE_ID TO CONTACTS
-- ============================================================================

alter table public.contacts
  add column if not exists pipeline_stage_id uuid references public.pipeline_stages(id) on delete set null;

create index if not exists contacts_pipeline_stage_idx on public.contacts(pipeline_stage_id);

-- ============================================================================
-- 3. SEED DEFAULT STAGES FOR EXISTING WORKSPACES
-- ============================================================================

-- Insert default stages for each existing workspace
insert into public.pipeline_stages (workspace_id, key, label, position)
select id, 'new', 'New', 1 from public.workspaces
on conflict (workspace_id, key) do nothing;

insert into public.pipeline_stages (workspace_id, key, label, position)
select id, 'attempting', 'Attempting', 2 from public.workspaces
on conflict (workspace_id, key) do nothing;

insert into public.pipeline_stages (workspace_id, key, label, position)
select id, 'warm', 'Warm', 3 from public.workspaces
on conflict (workspace_id, key) do nothing;

insert into public.pipeline_stages (workspace_id, key, label, position)
select id, 'hot', 'Hot', 4 from public.workspaces
on conflict (workspace_id, key) do nothing;

insert into public.pipeline_stages (workspace_id, key, label, position)
select id, 'won', 'Won', 5 from public.workspaces
on conflict (workspace_id, key) do nothing;

insert into public.pipeline_stages (workspace_id, key, label, position)
select id, 'lost', 'Lost', 6 from public.workspaces
on conflict (workspace_id, key) do nothing;

-- ============================================================================
-- 4. FUNCTION: AUTO-CREATE DEFAULT STAGES FOR NEW WORKSPACES
-- ============================================================================

create or replace function public.create_default_pipeline_stages()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.pipeline_stages (workspace_id, key, label, position) values
    (new.id, 'new', 'New', 1),
    (new.id, 'attempting', 'Attempting', 2),
    (new.id, 'warm', 'Warm', 3),
    (new.id, 'hot', 'Hot', 4),
    (new.id, 'won', 'Won', 5),
    (new.id, 'lost', 'Lost', 6)
  on conflict (workspace_id, key) do nothing;
  return new;
end;
$$;

-- Create trigger to auto-create stages when workspace is created
drop trigger if exists trg_create_default_pipeline_stages on public.workspaces;
create trigger trg_create_default_pipeline_stages
  after insert on public.workspaces
  for each row
  execute function public.create_default_pipeline_stages();

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

alter table public.pipeline_stages enable row level security;

-- Users can view pipeline stages in their workspace
create policy "pipeline_stages_select_workspace"
  on public.pipeline_stages
  for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = pipeline_stages.workspace_id
      and user_id = auth.uid()
    )
  );

-- Only workspace owners/admins can manage stages (for future v2)
-- For v1, we'll keep it read-only via API

-- ============================================================================
-- 6. INITIAL MIGRATION: SET PIPELINE_STAGE_ID BASED ON LEAD_STATUS
-- ============================================================================

-- Map existing contacts' lead_status to pipeline_stage_id
update public.contacts c
set pipeline_stage_id = (
  select ps.id
  from public.pipeline_stages ps
  where ps.workspace_id = c.workspace_id
  and ps.key = case
    when c.lead_status = 'new' then 'new'
    when c.lead_status = 'attempting' then 'attempting'
    when c.lead_status = 'warm' then 'warm'
    when c.lead_status = 'hot' then 'hot'
    when c.lead_status = 'won' then 'won'
    when c.lead_status = 'lost' then 'lost'
    else 'new'
  end
  limit 1
)
where c.workspace_id is not null
and c.pipeline_stage_id is null;



























































