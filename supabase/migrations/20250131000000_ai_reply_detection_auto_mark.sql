-- AI Reply Detection (Auto-Mark as Replied)
-- Adds detection columns to email_messages and updates email_threads schema

-- 1. Add detection JSONB column to email_messages
alter table if exists public.email_messages
  add column if not exists detection jsonb default null;
  
-- Index for detection queries
create index if not exists idx_msgs_detection on public.email_messages using gin (detection);

-- 2. Add columns to email_threads (if table exists)
-- Support both workspace_id and org_id patterns
do $$
begin
  -- Check if email_threads exists
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'email_threads'
  ) then
    -- Add first_replied_at
    alter table public.email_threads
      add column if not exists first_replied_at timestamptz;
      
    -- Add/update status to include 'replied' and 'needs_review'
    -- Drop existing constraint if it exists (handle various constraint names)
    alter table public.email_threads drop constraint if exists email_threads_status_check;
    alter table public.email_threads drop constraint if exists email_threads_status_fkey;
    
    -- Add new constraint with our status values (only if it doesn't exist)
    if not exists (
      select 1 from pg_constraint 
      where conname = 'email_threads_status_check'
      and conrelid = 'public.email_threads'::regclass
    ) then
      alter table public.email_threads
        add constraint email_threads_status_check
        check (status is null or status in (
          'unreplied', 'replied', 'needs_review', 'archived', 
          'open', 'snoozed', 'closed'
        ));
    end if;
    
    -- Add ai_flag column
    alter table public.email_threads
      add column if not exists ai_flag text check (ai_flag is null or ai_flag in ('handwritten', 'ooo', 'spammy', 'bounce'));
      
    -- Add org_id if it doesn't exist (some schemas use workspace_id instead)
    if not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_threads' 
      and column_name = 'org_id'
    ) then
      -- Try to infer from workspace_id if that exists
      if exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' 
        and table_name = 'email_threads' 
        and column_name = 'workspace_id'
      ) then
        -- Create an alias or use workspace_id as org_id
        -- For now, we'll use workspace_id in queries
        null;
      else
        -- Add org_id column (will need to be populated separately)
        alter table public.email_threads
          add column if not exists org_id uuid;
      end if;
    end if;
    
    -- Index for status filtering
    create index if not exists idx_email_threads_status on public.email_threads(status);
    create index if not exists idx_email_threads_ai_flag on public.email_threads(ai_flag);
    create index if not exists idx_email_threads_first_replied on public.email_threads(first_replied_at desc);
  end if;
end$$;

-- 3. Ensure email_messages has direction column for filtering inbound
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'email_messages'
  ) then
    -- Add direction if it doesn't exist
    if not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_messages' 
      and column_name = 'direction'
    ) then
      alter table public.email_messages
        add column direction text check (direction in ('inbound', 'outbound', 'sent', 'received'));
    end if;
    
    -- Add snippet if needed for detection
    alter table public.email_messages
      add column if not exists snippet text;
  end if;
end$$;

-- 4. Create detection stats view
create or replace view vw_detection_stats as
select
  date_trunc('day', coalesce(received_at, sent_at, created_at)) as day,
  (detection->>'label')::text as label,
  count(*) as cnt,
  round(avg(coalesce((detection->>'confidence')::numeric, 0.5)) * 100, 1) as avg_conf
from public.email_messages
where direction in ('inbound', 'received')
  and detection is not null
group by 1, 2
order by 1 desc, 2;

-- Grant access
grant select on vw_detection_stats to authenticated, anon;

