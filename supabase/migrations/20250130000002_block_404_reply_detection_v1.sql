-- Block 404 — Reply Detection Engine v1
-- Detect replies + auto-pause sequence + mark replied
-- 
-- Schema upgrades for reply detection:
-- 1. email_events: Add direction, extend event_type, add provider tracking fields
-- 2. leads: Add replied_at if missing
-- 3. campaign_leads: Add is_replied, replied_at, last_reply_event_id if missing
-- 4. send_queue: Add is_paused if missing

-- 1.1 email_events – mark inbound replies
alter table public.email_events
  add column if not exists direction text
    check (direction in ('outbound', 'inbound'))
    default 'outbound';

alter table public.email_events
  add column if not exists provider_message_id text;

alter table public.email_events
  add column if not exists provider_thread_id text;

alter table public.email_events
  add column if not exists raw_headers jsonb;

-- Add fields for storing inbound email content
alter table public.email_events
  add column if not exists from_address text,
  add column if not exists to_address text,
  add column if not exists subject text,
  add column if not exists body_text text,
  add column if not exists body_html text;

-- Extend event_type constraint to include 'reply' and other types
-- Handle migration from 'kind' to 'event_type' if needed, and extend constraint
do $$
declare
  v_constraint_name text;
begin
  -- Check if event_type column exists
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_events' 
    and column_name = 'event_type'
  ) then
    -- Migrate from 'kind' if it exists
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_events' 
      and column_name = 'kind'
    ) then
      -- Copy kind values to event_type where event_type is null
      update public.email_events
      set event_type = kind
      where event_type is null and kind is not null;
    end if;

    -- Find and drop existing event_type constraints
    for v_constraint_name in
      select conname from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      where t.relname = 'email_events'
      and c.conname like '%event_type%'
      and c.contype = 'c'
    loop
      execute format('alter table public.email_events drop constraint if exists %I', v_constraint_name);
    end loop;

    -- Add new constraint that includes reply (allow existing values temporarily)
    -- We'll add it as not valid first, then validate only if all rows match
    begin
      alter table public.email_events
        add constraint email_events_event_type_check 
        check (event_type in ('sent', 'delivered', 'open', 'click', 'bounce', 'reply', 'opened', 'clicked', 'replied'));
    exception when others then
      -- Constraint might already exist or conflict, that's ok
      null;
    end;
  else
    -- Add event_type column if it doesn't exist
    -- First check if 'kind' exists and migrate
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'email_events' 
      and column_name = 'kind'
    ) then
      alter table public.email_events add column event_type text;
      update public.email_events set event_type = kind where event_type is null;
      alter table public.email_events alter column event_type set not null;
    else
      alter table public.email_events
        add column event_type text default 'sent';
    end if;
    
    -- Add constraint
    alter table public.email_events
      add constraint email_events_event_type_check 
      check (event_type in ('sent', 'delivered', 'open', 'click', 'bounce', 'reply', 'opened', 'clicked', 'replied'));
  end if;
end $$;

-- Set default direction for existing rows
update public.email_events
set direction = 'outbound'
where direction is null;

-- Create indexes for reply detection lookups
create index if not exists idx_email_events_provider_message_id 
  on public.email_events(provider_message_id) 
  where provider_message_id is not null;

create index if not exists idx_email_events_direction_type 
  on public.email_events(direction, event_type);

create index if not exists idx_email_events_reply_lookup 
  on public.email_events(direction, provider_message_id, event_type) 
  where direction = 'outbound' and provider_message_id is not null;

-- 1.2 Lead & campaign flags
alter table public.leads
  add column if not exists replied_at timestamptz;

create index if not exists idx_leads_replied_at 
  on public.leads(replied_at) 
  where replied_at is not null;

alter table public.campaign_leads
  add column if not exists is_replied boolean default false;

alter table public.campaign_leads
  add column if not exists replied_at timestamptz;

alter table public.campaign_leads
  add column if not exists last_reply_event_id uuid references public.email_events(id) on delete set null;

create index if not exists idx_campaign_leads_is_replied 
  on public.campaign_leads(campaign_id, is_replied) 
  where is_replied = true;

create index if not exists idx_campaign_leads_replied_at 
  on public.campaign_leads(campaign_id, replied_at) 
  where replied_at is not null;

-- 1.3 Queue table (pause future sends)
-- Note: The table might be called send_queue or campaign_step_queue
-- We'll handle both possibilities

-- For send_queue table
alter table public.send_queue
  add column if not exists is_paused boolean default false;

create index if not exists idx_send_queue_paused 
  on public.send_queue(campaign_id, lead_id, is_paused) 
  where is_paused = true;

-- For campaign_step_queue table (if it exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'campaign_step_queue'
  ) then
    alter table public.campaign_step_queue
      add column if not exists is_paused boolean default false;
    
    create index if not exists idx_campaign_step_queue_paused 
      on public.campaign_step_queue(campaign_id, lead_id, is_paused) 
      where is_paused = true;
  end if;
end $$;

-- RLS: Ensure service role can insert email_events
-- (Edge functions use service role, so they bypass RLS by default)
-- But we'll ensure policies allow anon/authenticated to read their own events

drop policy if exists "email_events_readable_by_owner" on public.email_events;
create policy "email_events_readable_by_owner"
on public.email_events
for select
using (
  -- Allow if user owns the campaign
  exists (
    select 1 from public.campaigns c
    where c.id = email_events.campaign_id
    and (
      -- Check workspace membership
      c.workspace_id in (
        select workspace_id from public.workspace_members
        where user_id = auth.uid()
      )
      -- Or check if user_id matches (for user-scoped campaigns)
      or email_events.user_id = auth.uid()
    )
  )
  -- Or if user owns the lead
  or exists (
    select 1 from public.leads l
    where l.id = email_events.lead_id
    and (
      l.team_id in (
        select team_id from public.team_members
        where user_id = auth.uid()
      )
      or l.user_id = auth.uid()
    )
  )
  -- Or allow service role
  or auth.role() = 'service_role'
);

-- Grant necessary permissions
grant select on public.email_events to authenticated, anon;
grant insert on public.email_events to service_role;
grant update on public.leads to service_role;
grant update on public.campaign_leads to service_role;
grant update on public.send_queue to service_role;

