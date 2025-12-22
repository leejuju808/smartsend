-- User Template Library & Variants System
-- This creates a user-library based template system alongside the existing campaign-based template_versions

-- 1) Templates (user library)
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Note: template_variants already exists with different schema
-- We need to extend it or create compatibility views
-- For now, we'll assume the existing table structure and add necessary fields if missing

-- 2) Variants (generated or manual) - extending existing table if needed
do $$
begin
  -- Only add these columns if they don't already exist
  if not exists (select 1 from information_schema.columns where table_name='template_variants' and column_name='source') then
    alter table public.template_variants add column source text not null default 'manual';
  end if;
  
  -- Ensure we have a label column
  if not exists (select 1 from information_schema.columns where table_name='template_variants' and column_name='label') then
    alter table public.template_variants add column label text;
  end if;
end $$;

-- 3) Per-campaign experiment setup  
create table if not exists public.campaign_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  template_id uuid not null references public.email_templates(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 4) Split allocations
create table if not exists public.experiment_allocations (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.campaign_experiments(id) on delete cascade,
  variant_id uuid not null references public.template_variants(id) on delete cascade,
  pct integer not null check (pct > 0 and pct <= 100)
);

-- Indexes for performance
create index if not exists idx_email_templates_user on public.email_templates(user_id);
create index if not exists idx_campaign_experiments_campaign on public.campaign_experiments(campaign_id);
create index if not exists idx_campaign_experiments_user on public.campaign_experiments(user_id);
create index if not exists idx_experiment_allocations_experiment on public.experiment_allocations(experiment_id);

-- RLS (read/write own stuff)
alter table public.email_templates enable row level security;
alter table public.campaign_experiments enable row level security;
alter table public.experiment_allocations enable row level security;

create policy sel_templates on public.email_templates for select using (user_id = auth.uid());
create policy ins_templates on public.email_templates for insert with check (user_id = auth.uid());
create policy upd_templates on public.email_templates for update using (user_id = auth.uid());
create policy del_templates on public.email_templates for delete using (user_id = auth.uid());

create policy sel_cx on public.campaign_experiments for select using (user_id = auth.uid());
create policy ins_cx on public.campaign_experiments for insert with check (user_id = auth.uid());
create policy upd_cx on public.campaign_experiments for update using (user_id = auth.uid());
create policy del_cx on public.campaign_experiments for delete using (user_id = auth.uid());

create policy sel_alloc on public.experiment_allocations for select using (
  exists(select 1 from public.campaign_experiments e where e.id = experiment_id and e.user_id = auth.uid())
);
create policy ins_alloc on public.experiment_allocations for insert with check (
  exists(select 1 from public.campaign_experiments e where e.id = experiment_id and e.user_id = auth.uid())
);
create policy upd_alloc on public.experiment_allocations for update using (
  exists(select 1 from public.campaign_experiments e where e.id = experiment_id and e.user_id = auth.uid())
);
create policy del_alloc on public.experiment_allocations for delete using (
  exists(select 1 from public.campaign_experiments e where e.id = experiment_id and e.user_id = auth.uid())
);

