-- Pilot feedback system: update feedback table with category, org_id, and page_pathname
-- Supports structured feedback collection for launch validation

-- Ensure the table exists with the new structure
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text,
  message text,
  page_pathname text,
  created_at timestamptz default now()
);

-- Rename comment to message if rating/comment structure exists and message doesn't exist yet
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'feedback' 
    and column_name = 'comment'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'feedback' 
    and column_name = 'message'
  ) then
    alter table public.feedback rename column comment to message;
  end if;
end $$;

-- Add new columns if they don't exist (for existing tables)
do $$
begin
  -- Add org_id if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'feedback' and column_name = 'org_id'
  ) then
    alter table public.feedback add column org_id uuid;
  end if;

  -- Add category if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'feedback' and column_name = 'category'
  ) then
    alter table public.feedback add column category text;
  end if;

  -- Add message if it doesn't exist (and wasn't renamed from comment)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'feedback' and column_name = 'message'
  ) then
    alter table public.feedback add column message text;
  end if;

  -- Add page_pathname if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'feedback' and column_name = 'page_pathname'
  ) then
    alter table public.feedback add column page_pathname text;
  end if;
end $$;

-- Add foreign key constraint for org_id if it doesn't exist
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'feedback_org_id_fkey'
  ) then
    alter table public.feedback 
      add constraint feedback_org_id_fkey 
      foreign key (org_id) references orgs(id) on delete cascade;
  end if;
end $$;

-- Add check constraint for category if it doesn't exist
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'feedback_category_check'
  ) then
    alter table public.feedback 
      add constraint feedback_category_check 
      check (category is null or category in ('ui','bug','feature','performance','other'));
  end if;
end $$;

-- Drop old policies if they exist
drop policy if exists "Users can insert own feedback" on public.feedback;
drop policy if exists "Users can view own feedback" on public.feedback;
drop policy if exists "Admins can view all feedback" on public.feedback;

-- RLS policies
alter table public.feedback enable row level security;

-- Users can insert their own feedback
create policy "Users can insert own feedback" on public.feedback
  for insert
  with check (auth.uid() = user_id);

-- Users can view their own feedback
create policy "Users can view own feedback" on public.feedback
  for select
  using (auth.uid() = user_id);

-- Admins/owners can view org feedback (for pilot monitoring)
create policy "Org admins can view org feedback" on public.feedback
  for select
  using (
    exists (
      select 1 from org_members om
      where om.org_id = feedback.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

-- Index for querying feedback by org and category
create index if not exists idx_feedback_org_category on public.feedback(org_id, category) where org_id is not null;
create index if not exists idx_feedback_created_at on public.feedback(created_at desc);
create index if not exists idx_feedback_page_pathname on public.feedback(page_pathname) where page_pathname is not null;

