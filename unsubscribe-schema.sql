-- Unsubscribe functionality schema
-- Add to your Supabase database

-- Global suppression list per user/app
create table if not exists suppression_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  reason text default 'user_unsubscribe',
  created_at timestamptz default now(),
  unique (user_id, email)
);

-- Optional audit trail for unsubscribe events
create table if not exists unsubscribe_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  source text not null,   -- 'one_click', 'web_form', 'api'
  user_agent text,
  ip inet,
  created_at timestamptz default now()
);

-- Add indexes for performance
create index if not exists idx_suppression_list_user_email on suppression_list(user_id, email);
create index if not exists idx_suppression_list_email on suppression_list(email);
create index if not exists idx_unsubscribe_events_user_id on unsubscribe_events(user_id);
create index if not exists idx_unsubscribe_events_email on unsubscribe_events(email);
create index if not exists idx_unsubscribe_events_created_at on unsubscribe_events(created_at);

-- Add RLS policies for suppression_list
alter table suppression_list enable row level security;

-- Users can view their own suppression list
create policy "Users can view their own suppression list" on suppression_list
  for select using (auth.uid() = user_id);

-- Users can insert their own suppression entries
create policy "Users can insert their own suppression entries" on suppression_list
  for insert with check (auth.uid() = user_id);

-- Users can update their own suppression entries
create policy "Users can update their own suppression entries" on suppression_list
  for update using (auth.uid() = user_id);

-- Users can delete their own suppression entries
create policy "Users can delete their own suppression entries" on suppression_list
  for delete using (auth.uid() = user_id);

-- Add RLS policies for unsubscribe_events
alter table unsubscribe_events enable row level security;

-- Users can view their own unsubscribe events
create policy "Users can view their own unsubscribe events" on unsubscribe_events
  for select using (auth.uid() = user_id);

-- Service role can insert unsubscribe events (for API endpoints)
create policy "Service role can insert unsubscribe events" on unsubscribe_events
  for insert with check (true);