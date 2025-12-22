-- Block 14: Onboarding & Demo Data
-- Per-user onboarding progress tracking and demo data loader

-- 1. Create onboarding_state table
create table if not exists public.onboarding_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  project_created boolean not null default false,
  profile_connected boolean not null default false,
  demo_loaded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.onboarding_state enable row level security;

-- RLS: Users can read/update their own onboarding state
create policy "users manage own onboarding"
  on public.onboarding_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Demo loader RPC: creates a demo project+inbox (idempotent)
create or replace function public.load_demo_for_user()
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  pid uuid;
begin
  if uid is null then 
    raise exception 'auth required'; 
  end if;

  -- Check if demo project already exists
  select p.id into pid 
  from public.projects p
  inner join public.project_members pm on pm.project_id = p.id
  where p.name = 'Demo Project' and pm.user_id = uid
  limit 1;

  -- Create demo project if missing
  if pid is null then
    insert into public.projects (name) 
    values ('Demo Project') 
    returning id into pid;
    
    insert into public.project_members (project_id, user_id, role, accepted, accepted_at)
    values (pid, uid, 'owner', true, now());
  end if;

  -- Seed minimal demo data if not present
  if not exists (select 1 from public.leads where project_id = pid) then
    -- Insert demo leads
    insert into public.leads (project_id, email, name) 
    values
      (pid, 'maria@acme.com', 'Maria'),
      (pid, 'leo@orbit.io', 'Leo');

    -- Create threads for each lead
    insert into public.threads (project_id, lead_id, status)
    select pid, id, 'open' 
    from public.leads 
    where project_id = pid;

    -- Add 2-3 messages per thread
    -- Maria's thread: inbound + outbound
    insert into public.emails (project_id, thread_id, direction, subject, body, sender, recipient, created_at)
    select 
      pid, 
      t.id,
      'inbound',
      'Quick question',
      'Can you share pricing?',
      'maria@acme.com',
      'you@demo',
      now() - interval '2h'
    from public.threads t
    join public.leads l on l.id = t.lead_id
    where l.email = 'maria@acme.com' and t.project_id = pid;

    insert into public.emails (project_id, thread_id, direction, subject, body, sender, recipient, created_at)
    select 
      pid,
      t.id,
      'outbound',
      'Re: Quick question',
      '$99/mo Starter, $299/mo Pro. Let me know if you want to schedule a demo.',
      'you@demo',
      'maria@acme.com',
      now() - interval '90m'
    from public.threads t
    join public.leads l on l.id = t.lead_id
    where l.email = 'maria@acme.com' and t.project_id = pid;

    -- Leo's thread: inbound only
    insert into public.emails (project_id, thread_id, direction, subject, body, sender, recipient, created_at)
    select
      pid,
      t.id,
      'inbound',
      'Meeting Request',
      'Would love to set up a call to discuss your services.',
      'leo@orbit.io',
      'you@demo',
      now() - interval '4h'
    from public.threads t
    join public.leads l on l.id = t.lead_id
    where l.email = 'leo@orbit.io' and t.project_id = pid;
  end if;

  -- Update onboarding state
  insert into public.onboarding_state (user_id, demo_loaded, project_created)
  values (uid, true, true)
  on conflict (user_id) 
  do update 
    set demo_loaded = true, 
        project_created = true, 
        updated_at = now();

  return pid;
end $$;

-- 3. Create set_updated_at function if it doesn't exist
create or replace function public.set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 4. Trigger to auto-update updated_at
create trigger trg_onboarding_state_updated_at
before update on public.onboarding_state
for each row
execute function public.set_updated_at();

-- 5. Helper function to create onboarding state for new users
create or replace function public.handle_new_user_onboarding()
returns trigger
language plpgsql
security definer set search_path=public
as $$
begin
  insert into public.onboarding_state (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 6. Set up trigger on auth.users (if it doesn't exist)
drop trigger if exists on_auth_user_created_create_onboarding on auth.users;
create trigger on_auth_user_created_create_onboarding
after insert on auth.users
for each row execute function public.handle_new_user_onboarding();

-- 7. Grant execute on function to authenticated users
grant execute on function public.load_demo_for_user() to authenticated;

