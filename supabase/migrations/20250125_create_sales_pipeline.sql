-- Sales Pipeline System
-- Run this in your Supabase SQL editor

-- 1. Pipelines (org-level)
create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null default 'Default Pipeline',
  created_at timestamptz default now()
);

-- 2. Stages (columns)
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  name text not null,
  order_index int not null,
  created_at timestamptz default now()
);

-- 3. Add pipeline stage to contacts
alter table public.contacts
  add column if not exists pipeline_stage_id uuid references public.pipeline_stages(id);

-- 4. Create indexes for performance
create index if not exists idx_pipelines_org on public.pipelines(org_id);
create index if not exists idx_pipeline_stages_pipeline on public.pipeline_stages(pipeline_id);
create index if not exists idx_pipeline_stages_order on public.pipeline_stages(order_index);
create index if not exists idx_contacts_pipeline_stage on public.contacts(pipeline_stage_id);

-- 5. Enable RLS
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;

-- 6. RLS Policies
-- Users can view pipelines for orgs they're members of
create policy "Users can view org pipelines" on public.pipelines
  for select using (
    auth.uid() in (
      select user_id from public.org_members 
      where org_id = pipelines.org_id
    )
  );

-- Users can manage pipelines for orgs they're admin/owner of
create policy "Users can manage org pipelines" on public.pipelines
  for all using (
    auth.uid() in (
      select user_id from public.org_members 
      where org_id = pipelines.org_id and role in ('owner', 'admin')
    )
  );

-- Users can view stages for pipelines they have access to
create policy "Users can view pipeline stages" on public.pipeline_stages
  for select using (
    auth.uid() in (
      select user_id from public.org_members om
      join public.pipelines p on p.org_id = om.org_id
      where p.id = pipeline_stages.pipeline_id
    )
  );

-- Users can manage stages for pipelines they have admin access to
create policy "Users can manage pipeline stages" on public.pipeline_stages
  for all using (
    auth.uid() in (
      select user_id from public.org_members om
      join public.pipelines p on p.org_id = om.org_id
      where p.id = pipeline_stages.pipeline_id and om.role in ('owner', 'admin')
    )
  );

-- 7. Seed default pipeline and stages for existing orgs
insert into public.pipelines (org_id, name)
select id, 'Default Pipeline' from public.orgs
on conflict do nothing;

-- Seed default stages for each pipeline
insert into public.pipeline_stages (pipeline_id, name, order_index)
select 
  p.id,
  stage_name,
  stage_order
from public.pipelines p
cross join (
  values 
    ('New', 1),
    ('Engaged', 2),
    ('Replied', 3),
    ('Won', 4),
    ('Lost', 5)
) as stages(stage_name, stage_order)
on conflict do nothing;

-- 8. Add comments
comment on table public.pipelines is 'Sales pipelines for organizations';
comment on table public.pipeline_stages is 'Stages/columns within each pipeline';
comment on column public.contacts.pipeline_stage_id is 'Current stage in the sales pipeline'; 