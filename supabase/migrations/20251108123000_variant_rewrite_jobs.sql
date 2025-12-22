-- Step variant provenance + rewrite jobs (idempotent)

alter table public.step_variants
  add column if not exists origin text not null default 'manual',
  add column if not exists parent_variant_id uuid references public.step_variants(id) on delete set null,
  add column if not exists notes text;

create table if not exists public.variant_rewrite_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  step_id uuid not null references public.campaign_steps(id) on delete cascade,
  preset_id uuid references public.rewrite_presets(id) on delete set null,
  goal text,
  n int not null default 3,
  status text not null default 'queued',
  error text
);

alter table public.variant_rewrite_jobs enable row level security;

drop policy if exists sel_rewrite_jobs on public.variant_rewrite_jobs;
create policy sel_rewrite_jobs on public.variant_rewrite_jobs
for select
to authenticated
using (public.is_step_viewer(step_id));

drop policy if exists ins_rewrite_jobs on public.variant_rewrite_jobs;
create policy ins_rewrite_jobs on public.variant_rewrite_jobs
for insert
to authenticated
with check (public.is_step_editor(step_id));

drop policy if exists upd_rewrite_jobs on public.variant_rewrite_jobs;
create policy upd_rewrite_jobs on public.variant_rewrite_jobs
for update
to authenticated
using (public.is_step_editor(step_id))
with check (public.is_step_editor(step_id));




