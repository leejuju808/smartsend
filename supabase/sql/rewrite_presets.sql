-- Rewrite presets and events schema (idempotent)
create schema if not exists public;

-- A) Presets
create table if not exists public.rewrite_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete cascade,
  name text not null,
  tone text not null default 'professional',
  length text not null default 'short',
  reading_level text not null default 'grade8',
  cta text,
  avoid_phrases text[] not null default '{}',
  signoff text default 'Best,',
  variables jsonb not null default '{}'::jsonb
);

alter table public.rewrite_presets enable row level security;

drop policy if exists "rp_read" on public.rewrite_presets;
create policy "rp_read" on public.rewrite_presets
  for select to authenticated
  using (
    campaign_id is null
    or public.is_campaign_viewer(campaign_id)
  );

drop policy if exists "rp_write" on public.rewrite_presets;
create policy "rp_write" on public.rewrite_presets
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      campaign_id is null
      or public.is_campaign_editor(campaign_id)
      or public.is_campaign_owner(campaign_id)
    )
  );

drop policy if exists "rp_update" on public.rewrite_presets;
create policy "rp_update" on public.rewrite_presets
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- B) Rewrite events audit
create table if not exists public.rewrite_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  preset_id uuid references public.rewrite_presets (id) on delete set null,
  mode text not null,
  input_len int,
  output_len int
);

alter table public.rewrite_events enable row level security;

drop policy if exists "re_read" on public.rewrite_events;
create policy "re_read" on public.rewrite_events
  for select to authenticated
  using (
    campaign_id is null
    or public.is_campaign_viewer(campaign_id)
  );



