-- =========================================================
-- Block 15400 — SmartSend Import Engine v2
-- Smart Column Mapping, Auto-Detection, Error Handling & "One-Click Clean-Up"
-- =========================================================

-- ============================================
-- 1) Import Sessions Table (for chunked processing & resume)
-- ============================================

create table if not exists public.import_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_name text not null,
  total_rows int not null,
  processed_rows int default 0,
  status text not null check (
    status in ('pending', 'running', 'completed', 'failed', 'paused')
  ) default 'pending',
  danger_score text check (
    danger_score in ('safe', 'caution', 'risky')
  ),
  column_mapping jsonb default '{}'::jsonb,
  cleaned_data jsonb, -- stores cleaned preview data
  import_summary jsonb, -- stores final import results
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_import_sessions_workspace on public.import_sessions(workspace_id);
create index if not exists idx_import_sessions_status on public.import_sessions(status);
create index if not exists idx_import_sessions_created_at on public.import_sessions(created_at desc);

-- ============================================
-- 2) Import Profiles Table (saved mapping templates)
-- ============================================

create table if not exists public.import_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  source_type text, -- 'google_sheets', 'jobnimbus', 'yard_sign', 'website_form', 'storm_vendor', 'custom'
  column_mapping jsonb not null default '{}'::jsonb,
  default_tags jsonb default '[]'::jsonb,
  send_caps jsonb, -- e.g. {"daily": 50, "weekly": 200} for sketchy sources
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_import_profiles_workspace on public.import_profiles(workspace_id);
create index if not exists idx_import_profiles_source_type on public.import_profiles(source_type);
create unique index if not exists idx_import_profiles_workspace_name on public.import_profiles(workspace_id, name);

-- ============================================
-- 3) Import Results Table (detailed tracking)
-- ============================================

create table if not exists public.import_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.import_sessions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  total_added int default 0,
  total_updated int default 0,
  bad_emails_skipped int default 0,
  duplicates_removed int default 0,
  storm_risk_leads int default 0,
  old_quote_leads int default 0,
  high_value_neighborhood_leads int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_import_results_session on public.import_results(session_id);
create index if not exists idx_import_results_workspace on public.import_results(workspace_id);

-- ============================================
-- 4) Enhance contact_imports table (add new fields)
-- ============================================

alter table public.contact_imports
  add column if not exists session_id uuid references public.import_sessions(id) on delete set null,
  add column if not exists profile_id uuid references public.import_profiles(id) on delete set null,
  add column if not exists danger_score text check (
    danger_score in ('safe', 'caution', 'risky')
  ),
  add column if not exists column_mapping jsonb default '{}'::jsonb,
  add column if not exists cleaned_stats jsonb, -- e.g. {"rows_cleaned": 34, "emails_normalized": 12, "duplicates_merged": 5},
  add column if not exists import_summary jsonb; -- contractor-friendly summary

create index if not exists idx_contact_imports_session on public.contact_imports(session_id);
create index if not exists idx_contact_imports_profile on public.contact_imports(profile_id);

-- ============================================
-- 5) Add tags column to contacts if not exists
-- ============================================

alter table public.contacts
  add column if not exists tags jsonb default '[]'::jsonb,
  add column if not exists past_quote_amount numeric(12,2),
  add column if not exists address text,
  add column if not exists source_tags jsonb default '[]'::jsonb; -- e.g. ['storm_vendor', 'website_lead']

create index if not exists idx_contacts_tags on public.contacts using gin(tags);
create index if not exists idx_contacts_source_tags on public.contacts using gin(source_tags);

-- ============================================
-- 6) Updated_at trigger for import_sessions
-- ============================================

create or replace function public.set_import_sessions_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_import_sessions_updated_at on public.import_sessions;
create trigger trg_import_sessions_updated_at
  before update on public.import_sessions
  for each row
  execute function public.set_import_sessions_updated_at();

-- ============================================
-- 7) Updated_at trigger for import_profiles
-- ============================================

create or replace function public.set_import_profiles_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_import_profiles_updated_at on public.import_profiles;
create trigger trg_import_profiles_updated_at
  before update on public.import_profiles
  for each row
  execute function public.set_import_profiles_updated_at();

-- ============================================
-- 8) RLS Policies
-- ============================================

alter table public.import_sessions enable row level security;
alter table public.import_profiles enable row level security;
alter table public.import_results enable row level security;

-- Import Sessions: workspace members can read/write
drop policy if exists "import_sessions_select" on public.import_sessions;
create policy "import_sessions_select" on public.import_sessions
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "import_sessions_insert" on public.import_sessions;
create policy "import_sessions_insert" on public.import_sessions
  for insert with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "import_sessions_update" on public.import_sessions;
create policy "import_sessions_update" on public.import_sessions
  for update using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- Import Profiles: workspace members can read/write
drop policy if exists "import_profiles_select" on public.import_profiles;
create policy "import_profiles_select" on public.import_profiles
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "import_profiles_insert" on public.import_profiles;
create policy "import_profiles_insert" on public.import_profiles
  for insert with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "import_profiles_update" on public.import_profiles;
create policy "import_profiles_update" on public.import_profiles
  for update using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "import_profiles_delete" on public.import_profiles;
create policy "import_profiles_delete" on public.import_profiles
  for delete using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- Import Results: workspace members can read
drop policy if exists "import_results_select" on public.import_results;
create policy "import_results_select" on public.import_results
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "import_results_insert" on public.import_results;
create policy "import_results_insert" on public.import_results
  for insert with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- ============================================
-- 9) Helper Functions
-- ============================================

-- Function to calculate danger score
create or replace function public.calculate_import_danger_score(
  p_missing_email_pct numeric,
  p_invalid_email_pct numeric,
  p_duplicate_pct numeric,
  p_has_storm_tags boolean default false,
  p_looks_like_bought_list boolean default false
)
returns text
language plpgsql
as $$
declare
  score int := 0;
begin
  -- Missing emails
  if p_missing_email_pct > 30 then
    score := score + 3;
  elsif p_missing_email_pct > 15 then
    score := score + 2;
  elsif p_missing_email_pct > 5 then
    score := score + 1;
  end if;

  -- Invalid emails
  if p_invalid_email_pct > 20 then
    score := score + 3;
  elsif p_invalid_email_pct > 10 then
    score := score + 2;
  elsif p_invalid_email_pct > 5 then
    score := score + 1;
  end if;

  -- Duplicates
  if p_duplicate_pct > 15 then
    score := score + 2;
  elsif p_duplicate_pct > 5 then
    score := score + 1;
  end if;

  -- Storm/vendor tags
  if p_has_storm_tags then
    score := score + 1;
  end if;

  -- Bought list indicators
  if p_looks_like_bought_list then
    score := score + 2;
  end if;

  -- Return danger level
  if score >= 6 then
    return 'risky';
  elsif score >= 3 then
    return 'caution';
  else
    return 'safe';
  end if;
end;
$$;

-- ============================================
-- 10) Comments
-- ============================================

comment on table public.import_sessions is 'Tracks import sessions with chunked processing and resume capability';
comment on table public.import_profiles is 'Saved column mapping profiles per workspace for quick re-import';
comment on table public.import_results is 'Detailed import results with contractor-friendly metrics';
comment on column public.import_sessions.danger_score is 'Import safety level: safe, caution, or risky';
comment on column public.import_sessions.column_mapping is 'JSON mapping of CSV columns to contact fields';
comment on column public.import_sessions.cleaned_data is 'Preview of cleaned data before import';
comment on column public.import_profiles.source_type is 'Type of source: google_sheets, jobnimbus, yard_sign, website_form, storm_vendor, custom';
comment on column public.import_profiles.default_tags is 'Default tags to apply to contacts from this source';
comment on column public.import_profiles.send_caps is 'Recommended send limits for this source type';





















































