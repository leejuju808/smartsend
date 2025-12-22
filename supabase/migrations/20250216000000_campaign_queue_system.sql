-- Campaign Queue System Migration
-- Implements: campaigns, campaign_leads, send_queue, suppress_list with proper schema

-- 1. Update campaigns table with required columns
do $$
begin
  -- Add project_id if missing (using workspace_id as the identifier)
  -- Note: We'll use workspace_id which already exists
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'workspace_id') then
    alter table public.campaigns add column workspace_id uuid;
  end if;

  -- Add from_name if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'from_name') then
    alter table public.campaigns add column from_name text;
  end if;

  -- Add from_email if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'from_email') then
    alter table public.campaigns add column from_email text;
  end if;

  -- Add subject_template if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'subject_template') then
    alter table public.campaigns add column subject_template text;
  end if;

  -- Add body_template if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'body_template') then
    alter table public.campaigns add column body_template text;
  end if;

  -- Add daily_cap if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'daily_cap') then
    alter table public.campaigns add column daily_cap int default 100;
  end if;

  -- Add rate_per_min if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'rate_per_min') then
    alter table public.campaigns add column rate_per_min int default 20;
  end if;

  -- Update status column to include required values
  if exists (select 1 from information_schema.columns 
             where table_name = 'campaigns' and column_name = 'status') then
    -- Ensure status constraint includes required values
    -- Note: This might need manual adjustment if existing constraint is too restrictive
  end if;

  -- Add start_at if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'start_at') then
    alter table public.campaigns add column start_at timestamptz;
  end if;
end $$;

-- 2. Update campaign_leads table with state tracking
do $$
begin
  -- Add state column if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_leads' and column_name = 'state') then
    alter table public.campaign_leads add column state text check (state in ('Pending','Queued','Sending','Sent','Bounced','Replied','Error','Skipped')) default 'Pending';
  end if;

  -- Add last_error if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_leads' and column_name = 'last_error') then
    alter table public.campaign_leads add column last_error text;
  end if;

  -- Add sent_message_id if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_leads' and column_name = 'sent_message_id') then
    alter table public.campaign_leads add column sent_message_id text;
  end if;

  -- Add sent_at if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_leads' and column_name = 'sent_at') then
    alter table public.campaign_leads add column sent_at timestamptz;
  end if;
end $$;

-- 3. Update send_queue table with all required columns
do $$
begin
  -- Change id to bigserial if needed (keep uuid if already exists)
  -- Add/update columns
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'body') then
    alter table public.send_queue add column body text;
    -- Copy from body_html if it exists
    update public.send_queue set body = body_html where body is null and body_html is not null;
  end if;

  -- Add provider column if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'provider') then
    alter table public.send_queue add column provider text check (provider in ('gmail','outlook')) default 'gmail';
  end if;

  -- Add priority if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'priority') then
    alter table public.send_queue add column priority int default 100;
  end if;

  -- Add attempts (plural) if missing, keep attempt if exists
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'attempts') then
    if exists (select 1 from information_schema.columns 
               where table_name = 'send_queue' and column_name = 'attempt') then
      alter table public.send_queue rename column attempt to attempts;
    else
      alter table public.send_queue add column attempts int default 0;
    end if;
  end if;

  -- Add max_attempts if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'max_attempts') then
    alter table public.send_queue add column max_attempts int default 3;
  end if;

  -- Add not_before if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'not_before') then
    alter table public.send_queue add column not_before timestamptz default now();
    -- Copy from scheduled_at if exists
    update public.send_queue set not_before = scheduled_at where not_before is null and scheduled_at is not null;
  end if;

  -- Update state column to include required values
  if exists (select 1 from information_schema.columns 
             where table_name = 'send_queue' and column_name = 'status') then
    -- Rename status to state if status exists but state doesn't
    if not exists (select 1 from information_schema.columns 
                   where table_name = 'send_queue' and column_name = 'state') then
      alter table public.send_queue rename column status to state;
    end if;
  end if;

  -- Add error column if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'error') then
    alter table public.send_queue add column error text;
  end if;

  -- Add locked_at if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'locked_at') then
    alter table public.send_queue add column locked_at timestamptz;
  end if;

  -- Add worker_id if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'worker_id') then
    alter table public.send_queue add column worker_id text;
  end if;
end $$;

-- Ensure state column has correct constraint
alter table public.send_queue 
  drop constraint if exists send_queue_state_check,
  add constraint send_queue_state_check 
    check (state in ('Queued','Locked','Done','Error','Skipped'));

-- Update default state
alter table public.send_queue alter column state set default 'Queued';

-- 4. Create suppress_list table
create table if not exists public.suppress_list (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email text not null,
  reason text,
  created_at timestamptz default now(),
  unique (workspace_id, email)
);

create index if not exists idx_suppress_list_workspace_email 
  on public.suppress_list(workspace_id, email);

-- 5. Create index for send_queue ready queries
create index if not exists idx_send_queue_ready
  on public.send_queue (state, not_before, priority desc nulls last)
  where state = 'Queued';

-- 6. RLS Policies
alter table public.campaigns enable row level security;
alter table public.campaign_leads enable row level security;
alter table public.send_queue enable row level security;
alter table public.suppress_list enable row level security;

-- Helper function to check workspace membership
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$$;

-- Campaigns policies
drop policy if exists "proj_read" on public.campaigns;
create policy "proj_read" on public.campaigns 
  for select using (
    workspace_id is not null and public.is_workspace_member(workspace_id)
  );

drop policy if exists "proj_update" on public.campaigns;
create policy "proj_update" on public.campaigns 
  for update using (
    workspace_id is not null and public.is_workspace_member(workspace_id)
  ) with check (true);

-- Campaign leads policies
drop policy if exists "campaign_leads_read" on public.campaign_leads;
create policy "campaign_leads_read" on public.campaign_leads
  for select using (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_leads.campaign_id 
      and c.workspace_id is not null 
      and public.is_workspace_member(c.workspace_id)
    )
  );

drop policy if exists "campaign_leads_all" on public.campaign_leads;
create policy "campaign_leads_all" on public.campaign_leads
  for all using (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_leads.campaign_id 
      and c.workspace_id is not null 
      and public.is_workspace_member(c.workspace_id)
    )
  ) with check (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_leads.campaign_id 
      and c.workspace_id is not null 
      and public.is_workspace_member(c.workspace_id)
    )
  );

-- Send queue policies
drop policy if exists "send_queue_read" on public.send_queue;
create policy "send_queue_read" on public.send_queue
  for select using (
    exists (
      select 1 from public.campaigns c 
      where c.id = send_queue.campaign_id 
      and c.workspace_id is not null 
      and public.is_workspace_member(c.workspace_id)
    )
  );

drop policy if exists "send_queue_all" on public.send_queue;
create policy "send_queue_all" on public.send_queue
  for all using (
    exists (
      select 1 from public.campaigns c 
      where c.id = send_queue.campaign_id 
      and c.workspace_id is not null 
      and public.is_workspace_member(c.workspace_id)
    )
  ) with check (
    exists (
      select 1 from public.campaigns c 
      where c.id = send_queue.campaign_id 
      and c.workspace_id is not null 
      and public.is_workspace_member(c.workspace_id)
    )
  );

-- Suppress list policies
drop policy if exists "suppress_list_read" on public.suppress_list;
create policy "suppress_list_read" on public.suppress_list
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "suppress_list_all" on public.suppress_list;
create policy "suppress_list_all" on public.suppress_list
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

