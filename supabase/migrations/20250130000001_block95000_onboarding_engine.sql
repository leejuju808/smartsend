-- =========================================================
-- BLOCK 95000 — Onboarding Engine: Task Runner + Progress Sync + First-Login State
-- =========================================================

-- 1. Add first_login column to profiles table
alter table public.profiles 
  add column if not exists first_login boolean default true;

create index if not exists idx_profiles_first_login on public.profiles(first_login);

-- 2. Create global onboarding_tasks table (defines the 7 tasks)
create table if not exists public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cta_text text not null, -- e.g., "Connect Inbox →"
  cta_url text not null, -- e.g., "/onboarding/connect-email"
  order_index int not null,
  required boolean default true, -- can this task be skipped?
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(order_index)
);

-- 3. Create user_onboarding_progress table (tracks user's progress on tasks)
create table if not exists public.user_onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.onboarding_tasks(id) on delete cascade,
  completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, task_id)
);

create index if not exists idx_user_onboarding_progress_user on public.user_onboarding_progress(user_id);
create index if not exists idx_user_onboarding_progress_task on public.user_onboarding_progress(task_id);
create index if not exists idx_user_onboarding_progress_completed on public.user_onboarding_progress(completed);

-- Updated_at triggers
create or replace function public.set_onboarding_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.set_user_onboarding_progress_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_onboarding_tasks_updated_at on public.onboarding_tasks;
create trigger trg_onboarding_tasks_updated_at
  before update on public.onboarding_tasks
  for each row
  execute function public.set_onboarding_tasks_updated_at();

drop trigger if exists trg_user_onboarding_progress_updated_at on public.user_onboarding_progress;
create trigger trg_user_onboarding_progress_updated_at
  before update on public.user_onboarding_progress
  for each row
  execute function public.set_user_onboarding_progress_updated_at();

-- Enable RLS
alter table public.onboarding_tasks enable row level security;
alter table public.user_onboarding_progress enable row level security;

-- RLS Policies for onboarding_tasks (public read, admin write)
create policy "onboarding_tasks_read" on public.onboarding_tasks
  for select
  using (true); -- Everyone can read the task definitions

-- RLS Policies for user_onboarding_progress
create policy "user_onboarding_progress_read" on public.user_onboarding_progress
  for select
  using (auth.uid() = user_id);

create policy "user_onboarding_progress_insert" on public.user_onboarding_progress
  for insert
  with check (auth.uid() = user_id);

create policy "user_onboarding_progress_update" on public.user_onboarding_progress
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Insert default 7 onboarding tasks
insert into public.onboarding_tasks (title, description, cta_text, cta_url, order_index, required)
values
  ('Connect Your Email', 'Link your Gmail or Outlook to start sending personalized emails', 'Connect Inbox →', '/onboarding/connect-email', 1, true),
  ('Import Your Leads', 'Upload your contact list to start reaching out', 'Import Leads →', '/onboarding/add-leads', 2, true),
  ('Choose Your Template', 'Select an email template that matches your style', 'Choose Template →', '/onboarding/choose-template', 3, true),
  ('Personalize Your Message', 'Let AI customize your emails for each lead', 'Personalize →', '/onboarding/ai-personalize', 4, true),
  ('Review Your Campaign', 'Double-check everything looks good', 'Review →', '/onboarding/review', 5, true),
  ('Launch Your First Campaign', 'Send your first batch of personalized emails', 'Launch Campaign →', '/onboarding/finish', 6, true),
  ('Book Your First Inspection', 'Schedule your first appointment from replies', 'Book Inspection →', '/onboarding/finish', 7, false)
on conflict (order_index) do nothing;

-- Helper function: Get user onboarding status
create or replace function public.get_user_onboarding_status(p_user_id uuid)
returns table (
  task_id uuid,
  title text,
  description text,
  cta_text text,
  cta_url text,
  order_index int,
  required boolean,
  completed boolean,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select 
    t.id as task_id,
    t.title,
    t.description,
    t.cta_text,
    t.cta_url,
    t.order_index,
    t.required,
    coalesce(p.completed, false) as completed,
    p.completed_at
  from public.onboarding_tasks t
  left join public.user_onboarding_progress p 
    on p.task_id = t.id and p.user_id = p_user_id
  order by t.order_index;
end;
$$;

-- Database function to initialize onboarding for a new user
create or replace function public.initialize_user_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_record record;
begin
  -- Fetch all onboarding tasks
  for task_record in 
    select id from public.onboarding_tasks order by order_index
  loop
    -- Insert progress record for each task
    insert into public.user_onboarding_progress (user_id, task_id, completed)
    values (new.id, task_record.id, false)
    on conflict (user_id, task_id) do nothing;
  end loop;

  -- Set first_login flag on profiles (if profile exists)
  -- Note: Profile might be created by a separate trigger, so we use INSERT ... ON CONFLICT
  insert into public.profiles (id, first_login)
  values (new.id, true)
  on conflict (id) do update set first_login = true;

  return new;
end;
$$;

-- Create trigger to auto-initialize onboarding on new user signup
drop trigger if exists on_auth_user_created_initialize_onboarding on auth.users;
create trigger on_auth_user_created_initialize_onboarding
  after insert on auth.users
  for each row
  execute function public.initialize_user_onboarding();


























