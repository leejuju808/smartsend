-- Sender Profiles: OAuth-connected Gmail/Outlook accounts for sending emails
create table if not exists public.sender_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  email text not null,
  display_name text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  provider_meta jsonb,
  daily_limit int not null default 200,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.sender_profiles enable row level security;

-- Drop existing policy if it exists
drop policy if exists "own_profiles" on public.sender_profiles;

-- RLS policy: users can only access their own profiles
create policy "own_profiles" on public.sender_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Indexes for performance
create index if not exists idx_sender_profiles_user on public.sender_profiles(user_id);
create index if not exists idx_sender_profiles_provider on public.sender_profiles(provider);

-- Ensure campaigns table has sender_profile_id column
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'sender_profile_id') then
    alter table public.campaigns add column sender_profile_id uuid references public.sender_profiles(id) on delete set null;
  else
    -- If column exists but FK doesn't, add it
    if not exists (
      select 1 from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
      where tc.table_name = 'campaigns' 
        and tc.constraint_type = 'FOREIGN KEY'
        and kcu.column_name = 'sender_profile_id'
    ) then
      alter table public.campaigns 
        add constraint fk_campaigns_sender_profile 
        foreign key (sender_profile_id) references public.sender_profiles(id) on delete set null;
    end if;
  end if;
end $$;

