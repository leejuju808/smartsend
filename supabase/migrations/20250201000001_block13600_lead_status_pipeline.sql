-- Block 13600 — Lead Status Engine + Pipeline Board v1 (Hot/Warm/Cold + Qualified + Lost)
-- This is the piece that makes SmartSend feel like money: clear pipeline + status labels that tie into the intent engine and contact timeline.

-- ============================================================================
-- 1. ADD lead_status TO contacts TABLE
-- ============================================================================

alter table public.contacts
  add column if not exists lead_status text check (
    lead_status in (
      'new',          -- just imported / not touched
      'attempting',   -- outreach in progress
      'warm',         -- replied / some interest
      'hot',          -- strong buying signals
      'qualified',    -- confirmed good fit
      'booked',       -- estimate/meeting booked
      'won',          -- closed deal
      'lost'          -- no-go
    )
  ) default 'new';

-- Index for lead_status queries
create index if not exists idx_contacts_lead_status on public.contacts(lead_status) where lead_status is not null;
create index if not exists idx_contacts_workspace_lead_status on public.contacts(workspace_id, lead_status) where lead_status is not null;

-- ============================================================================
-- 2. CREATE PIPELINES TABLE
-- ============================================================================

create table if not exists public.pipelines (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references public.profiles(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_pipelines_workspace_id on public.pipelines(workspace_id);
create index if not exists idx_pipelines_owner_id on public.pipelines(owner_id);

-- ============================================================================
-- 3. CREATE pipeline_stages TABLE
-- ============================================================================

create table if not exists public.pipeline_stages (
  id uuid primary key default uuid_generate_v4(),
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_pipeline_stages_pipeline_id on public.pipeline_stages(pipeline_id);
create index if not exists idx_pipeline_stages_position on public.pipeline_stages(pipeline_id, position);

-- ============================================================================
-- 4. CREATE contact_pipeline TABLE (junction table)
-- ============================================================================

create table if not exists public.contact_pipeline (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid references public.contacts(id) on delete cascade,
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_contact_pipeline_contact_id on public.contact_pipeline(contact_id);
create index if not exists idx_contact_pipeline_pipeline_id on public.contact_pipeline(pipeline_id);
create index if not exists idx_contact_pipeline_stage_id on public.contact_pipeline(stage_id);
create unique index if not exists idx_contact_pipeline_unique on public.contact_pipeline(contact_id, pipeline_id);

-- Trigger to update updated_at
create or replace function public.update_contact_pipeline_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contact_pipeline_updated_at on public.contact_pipeline;
create trigger trg_contact_pipeline_updated_at
before update on public.contact_pipeline
for each row
execute function public.update_contact_pipeline_updated_at();

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.contact_pipeline enable row level security;

-- Pipelines: Users can read pipelines in their workspace
create policy "pipelines_select_workspace"
  on public.pipelines
  for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pipelines.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Pipelines: Users can insert pipelines in their workspace
create policy "pipelines_insert_workspace"
  on public.pipelines
  for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pipelines.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Pipelines: Users can update pipelines in their workspace
create policy "pipelines_update_workspace"
  on public.pipelines
  for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pipelines.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Pipeline stages: Users can read stages for pipelines in their workspace
create policy "pipeline_stages_select_workspace"
  on public.pipeline_stages
  for select
  using (
    exists (
      select 1 from public.pipelines p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = pipeline_stages.pipeline_id
      and wm.user_id = auth.uid()
    )
  );

-- Pipeline stages: Users can insert/update stages for pipelines in their workspace
create policy "pipeline_stages_modify_workspace"
  on public.pipeline_stages
  for all
  using (
    exists (
      select 1 from public.pipelines p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = pipeline_stages.pipeline_id
      and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.pipelines p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = pipeline_stages.pipeline_id
      and wm.user_id = auth.uid()
    )
  );

-- Contact pipeline: Users can read contact_pipeline for contacts in their workspace
create policy "contact_pipeline_select_workspace"
  on public.contact_pipeline
  for select
  using (
    exists (
      select 1 from public.contacts c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = contact_pipeline.contact_id
      and wm.user_id = auth.uid()
    )
  );

-- Contact pipeline: Users can insert/update contact_pipeline for contacts in their workspace
create policy "contact_pipeline_modify_workspace"
  on public.contact_pipeline
  for all
  using (
    exists (
      select 1 from public.contacts c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = contact_pipeline.contact_id
      and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = contact_pipeline.contact_id
      and wm.user_id = auth.uid()
    )
  );

-- Grant access
grant select, insert, update on public.pipelines to authenticated;
grant select, insert, update on public.pipeline_stages to authenticated;
grant select, insert, update on public.contact_pipeline to authenticated;

-- ============================================================================
-- 6. FUNCTION TO CREATE DEFAULT PIPELINE FOR WORKSPACE
-- ============================================================================

create or replace function public.create_default_pipeline_for_workspace(
  p_workspace_id uuid,
  p_owner_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_id uuid;
  v_stage_id uuid;
begin
  -- Check if default pipeline already exists
  select id into v_pipeline_id
  from public.pipelines
  where workspace_id = p_workspace_id
    and name = 'Default Pipeline'
  limit 1;

  if v_pipeline_id is not null then
    return v_pipeline_id;
  end if;

  -- Create pipeline
  insert into public.pipelines (workspace_id, owner_id, name)
  values (p_workspace_id, p_owner_id, 'Default Pipeline')
  returning id into v_pipeline_id;

  -- Create default stages
  insert into public.pipeline_stages (pipeline_id, name, position) values
    (v_pipeline_id, 'New', 0),
    (v_pipeline_id, 'Attempting Contact', 1),
    (v_pipeline_id, 'Warm Lead', 2),
    (v_pipeline_id, 'Hot Lead', 3),
    (v_pipeline_id, 'Booked', 4),
    (v_pipeline_id, 'Won', 5),
    (v_pipeline_id, 'Lost', 6);

  return v_pipeline_id;
end;
$$;

grant execute on function public.create_default_pipeline_for_workspace(uuid, uuid) to authenticated;

comment on function public.create_default_pipeline_for_workspace is 'Creates a default pipeline with standard stages for a workspace';



























































