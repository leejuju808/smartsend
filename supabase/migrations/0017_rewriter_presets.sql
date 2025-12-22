-- Rewriter presets for AI rewriting
-- This table stores predefined tone/length combinations for quick selection

create table if not exists public.rewrite_presets (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,           -- e.g., "Short – Curious"
  tone text not null,           -- friendly|professional|curious|direct|concise
  length text not null,         -- short|medium|long
  created_at timestamptz not null default now()
);

alter table public.rewrite_presets enable row level security;

create policy "members read/write presets" on public.rewrite_presets
  for select using (is_member(project_id))
  for insert with check (is_member(project_id));

-- Add helpful index
create index if not exists idx_rewrite_presets_project on public.rewrite_presets(project_id);
