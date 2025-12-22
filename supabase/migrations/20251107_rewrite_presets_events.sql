-- Rewrite presets and audit tables

create table if not exists public.rewrite_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  name text not null,
  tone text not null check (tone in ('friendly','professional','concise','assertive','warm')),
  goal text not null check (goal in ('book_meeting','nudge','qualify','followup','intro')),
  length text not null check (length in ('short','medium','long')),
  cta text,
  extra jsonb not null default '{}'::jsonb
);

create index if not exists idx_rewrite_presets_campaign
  on public.rewrite_presets(campaign_id);

create index if not exists idx_rewrite_presets_user
  on public.rewrite_presets(user_id);

alter table public.rewrite_presets enable row level security;

drop policy if exists "rewrite_presets_select" on public.rewrite_presets;
drop policy if exists "rewrite_presets_write" on public.rewrite_presets;

create policy "rewrite_presets_select" on public.rewrite_presets
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (campaign_id is not null and public.is_campaign_viewer(campaign_id))
  );

create policy "rewrite_presets_write" on public.rewrite_presets
  for all
  to authenticated
  using (
    user_id = auth.uid()
    or (campaign_id is not null and public.is_campaign_editor(campaign_id))
  )
  with check (
    user_id = auth.uid()
    or (campaign_id is not null and public.is_campaign_editor(campaign_id))
  );


create table if not exists public.rewrite_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  draft_id uuid references public.reply_drafts(id) on delete set null,
  source text check (source in ('composer','variant','followup_engine')),
  tone text check (tone in ('friendly','professional','concise','assertive','warm')),
  goal text check (goal in ('book_meeting','nudge','qualify','followup','intro')),
  length text check (length in ('short','medium','long')),
  picked boolean default false
);

create index if not exists idx_rewrite_events_campaign
  on public.rewrite_events(campaign_id);

create index if not exists idx_rewrite_events_user
  on public.rewrite_events(user_id);

create index if not exists idx_rewrite_events_thread
  on public.rewrite_events(thread_id);

alter table public.rewrite_events enable row level security;

drop policy if exists "rewrite_events_select" on public.rewrite_events;
drop policy if exists "rewrite_events_insert" on public.rewrite_events;

create policy "rewrite_events_select" on public.rewrite_events
  for select
  to authenticated
  using (
    coalesce(user_id, auth.uid()) = auth.uid()
    or (campaign_id is not null and public.is_campaign_viewer(campaign_id))
  );

create policy "rewrite_events_insert" on public.rewrite_events
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or (campaign_id is not null and public.is_campaign_editor(campaign_id))
  );

