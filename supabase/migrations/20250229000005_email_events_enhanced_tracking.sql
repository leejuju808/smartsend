-- Enhanced email events tracking system
-- Adds rollup columns to email_logs, improved email_events schema, triggers, and RLS

-- First, ensure email_logs has the necessary columns
alter table public.email_logs
  add column if not exists workspace_id uuid,
  add column if not exists first_opened_at timestamptz,
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count int not null default 0,
  add column if not exists click_count int not null default 0,
  add column if not exists from_address text,
  add column if not exists to_address text,
  add column if not exists message_id text;

-- Create index on workspace_id for email_logs if it doesn't exist
create index if not exists idx_email_logs_workspace on public.email_logs(workspace_id);

-- Now check and enhance email_events table
-- Add columns if they don't exist (using do block to check first)
do $$ 
begin
  -- Ensure email_events has the proper structure
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_events' 
    and column_name = 'email_log_id'
  ) then
    -- email_events doesn't exist, create it
    create table public.email_events (
      id uuid primary key default gen_random_uuid(),
      email_log_id uuid not null references public.email_logs(id) on delete cascade,
      event_type text not null check (event_type in ('open','click')),
      link_url text,                         -- null for open
      user_agent text,
      ip inet,
      created_at timestamptz not null default now()
    );
  else
    -- email_events exists, add missing columns if needed
    alter table public.email_events
      add column if not exists link_url text,  -- rename from url to link_url for consistency
      add column if not exists user_agent text,
      add column if not exists ip inet;
    
    -- Rename url to link_url if url exists and link_url doesn't
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_events' 
      and column_name = 'url'
    ) and not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_events' 
      and column_name = 'link_url'
    ) then
      alter table public.email_events rename column url to link_url;
    end if;
    
    -- Rename ua to user_agent if ua exists and user_agent doesn't
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_events' 
      and column_name = 'ua'
    ) and not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_events' 
      and column_name = 'user_agent'
    ) then
      alter table public.email_events rename column ua to user_agent;
    end if;
    
    -- Ensure ip column exists and is inet type
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_events' 
      and column_name = 'ip'
      and data_type != 'inet'
    ) then
      -- Convert text to inet by first creating a new column, migrating data, dropping old, renaming
      alter table public.email_events add column if not exists ip_new inet;
      update public.email_events set ip_new = cast(ip as inet) where ip is not null;
      alter table public.email_events drop column if exists ip;
      alter table public.email_events rename column ip_new to ip;
    elsif not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_events' 
      and column_name = 'ip'
    ) then
      alter table public.email_events add column ip inet;
    end if;
  end if;
end $$;

-- Create helpful indexes on email_events
create index if not exists idx_email_events_log on public.email_events(email_log_id);
create index if not exists idx_email_events_type_time on public.email_events(event_type, created_at desc);

-- Enable RLS on email_events if not already enabled
alter table public.email_events enable row level security;

-- Drop old policies if they exist
drop policy if exists "tenant read events" on public.email_events;
drop policy if exists "service insert events" on public.email_events;
drop policy if exists "email_events_select_own" on public.email_events;
drop policy if exists "email_events_insert" on public.email_events;

-- RLS: Only allow row access for the workspace that owns the parent email_logs row
create policy "tenant read events" on public.email_events
for select using (
  exists (
    select 1
    from public.email_logs l
    where l.id = email_events.email_log_id
      and l.workspace_id in (
        select workspace_id 
        from public.workspace_members 
        where user_id = auth.uid()
      )
  )
);

-- Edge function/API will insert using service key
create policy "service insert events"
on public.email_events for insert
to service_role
with check (true);

-- Optional: Allow authenticated users to read their own events via user_id
create policy "users read own events" on public.email_events
for select using (
  exists (
    select 1 from public.email_logs el
    where el.id = email_events.email_log_id
      and el.user_id = auth.uid()
  )
);

-- Trigger function to auto-rollup counts on email_logs
create or replace function bump_email_log_rollups() returns trigger as $$
begin
  if NEW.event_type = 'open' then
    update public.email_logs
      set open_count = open_count + 1,
          first_opened_at = coalesce(first_opened_at, NEW.created_at),
          last_opened_at = NEW.created_at
      where id = NEW.email_log_id;
  elsif NEW.event_type = 'click' then
    update public.email_logs
      set click_count = click_count + 1,
          clicked = true,  -- legacy boolean field
          clicked_at = coalesce(clicked_at, NEW.created_at),  -- legacy timestamp
          click_url = coalesce(click_url, NEW.link_url)  -- legacy url field
      where id = NEW.email_log_id;
  end if;
  return NEW;
end; $$ language plpgsql;

-- Drop existing trigger if it exists
drop trigger if exists trg_email_event_rollup on public.email_events;

-- Create trigger
create trigger trg_email_event_rollup
after insert on public.email_events
for each row execute procedure bump_email_log_rollups();

-- Grant necessary permissions to service_role
grant all on public.email_events to service_role;
grant insert, update on public.email_logs to service_role;

