-- Block 472 — AI SDR Autopilot v1
-- Autonomous sales rep that continues conversations, revives cold leads, and handles interest replies

-- ============================================================================
-- 1️⃣ Create ai_sdr_threads table
-- ============================================================================

create table if not exists public.ai_sdr_threads (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,

  last_message_from text check (last_message_from in ('lead', 'me')),
  last_message_at timestamptz not null default now(),

  status text check (status in ('idle','awaiting_reply','followup_scheduled','closed_won','closed_lost'))
    default 'idle',

  next_action_at timestamptz,
  created_at timestamptz default now(),
  
  -- Ensure one thread per lead per campaign
  unique(lead_id, campaign_id)
);

-- Indexes for efficient queries
create index if not exists idx_ai_sdr_threads_lead on public.ai_sdr_threads(lead_id);
create index if not exists idx_ai_sdr_threads_campaign on public.ai_sdr_threads(campaign_id);
create index if not exists idx_ai_sdr_threads_status on public.ai_sdr_threads(status);
create index if not exists idx_ai_sdr_threads_next_action on public.ai_sdr_threads(next_action_at) where next_action_at is not null;
create index if not exists idx_ai_sdr_threads_last_message_at on public.ai_sdr_threads(last_message_at);

-- ============================================================================
-- 2️⃣ Create ai_sdr_events table
-- ============================================================================

create table if not exists public.ai_sdr_events (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_sdr_threads(id) on delete cascade,

  event_type text not null check (event_type in (
      'send_followup',
      'reply_interest',
      'revive_lead',
      'close_won',
      'close_lost'
  )),

  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Indexes for efficient queries
create index if not exists idx_ai_sdr_events_thread on public.ai_sdr_events(thread_id);
create index if not exists idx_ai_sdr_events_type on public.ai_sdr_events(event_type);
create index if not exists idx_ai_sdr_events_created_at on public.ai_sdr_events(created_at desc);

-- ============================================================================
-- 3️⃣ Add ai_sdr_enabled column to campaigns table
-- ============================================================================

alter table public.campaigns
  add column if not exists ai_sdr_enabled boolean default false;

create index if not exists idx_campaigns_ai_sdr_enabled on public.campaigns(ai_sdr_enabled) where ai_sdr_enabled = true;

-- ============================================================================
-- 4️⃣ Enable RLS and create policies
-- ============================================================================

alter table public.ai_sdr_threads enable row level security;
alter table public.ai_sdr_events enable row level security;

-- RLS Policy: Users can only see threads for their own leads
create policy "user owns threads" on public.ai_sdr_threads
  for all using (
    auth.uid() = (select user_id from public.leads where id = lead_id)
  );

-- RLS Policy: Users can only see events for their own threads
create policy "user owns events" on public.ai_sdr_events
  for all using (
    auth.uid() = (
      select l.user_id 
      from public.ai_sdr_threads t
      join public.leads l on l.id = t.lead_id
      where t.id = thread_id
    )
  );

-- Service role can manage all threads and events (for edge functions)
create policy "service_role_manages_threads" on public.ai_sdr_threads
  for all to service_role using (true) with check (true);

create policy "service_role_manages_events" on public.ai_sdr_events
  for all to service_role using (true) with check (true);

-- ============================================================================
-- 5️⃣ Create function to handle inbound email triggers
-- ============================================================================

create or replace function public.handle_inbound_email_for_ai_sdr()
returns trigger
language plpgsql
security definer
as $$
declare
  v_campaign_id uuid;
  v_user_id uuid;
  v_thread_id uuid;
  v_is_inbound boolean := false;
begin
  -- Check if this is an inbound email
  -- Try is_incoming first (most common column name)
  begin
    v_is_inbound := NEW.is_incoming;
  exception when others then
    -- Column doesn't exist, try has_replied
    begin
      v_is_inbound := NEW.has_replied;
    exception when others then
      -- Neither column exists, skip
      return NEW;
    end;
  end;

  -- Only process if this is an inbound email (from lead)
  if not v_is_inbound then
    return NEW;
  end if;

  -- Get lead and campaign info
  select l.campaign_id, l.user_id into v_campaign_id, v_user_id
  from public.leads l
  where l.id = NEW.lead_id;

  -- Only proceed if lead has a campaign with AI SDR enabled
  if v_campaign_id is null then
    return NEW;
  end if;

  if not exists (
    select 1 from public.campaigns 
    where id = v_campaign_id and ai_sdr_enabled = true
  ) then
    return NEW;
  end if;

  -- Find or create thread
  select id into v_thread_id
  from public.ai_sdr_threads
  where lead_id = NEW.lead_id and campaign_id = v_campaign_id;

  if v_thread_id is null then
    insert into public.ai_sdr_threads (lead_id, campaign_id, last_message_from, last_message_at, status, next_action_at)
    values (NEW.lead_id, v_campaign_id, 'lead', NEW.created_at, 'awaiting_reply', NEW.created_at + interval '3 hours')
    returning id into v_thread_id;
  else
    -- Update existing thread
    update public.ai_sdr_threads
    set 
      last_message_from = 'lead',
      last_message_at = NEW.created_at,
      status = 'awaiting_reply',
      next_action_at = NEW.created_at + interval '3 hours'
    where id = v_thread_id;
  end if;

  return NEW;
end;
$$;

-- Create trigger on emails table
-- Note: This will work if is_incoming column exists. If not, the function handles it gracefully.
drop trigger if exists trg_inbound_email_ai_sdr on public.emails;

-- Try to create trigger with is_incoming check
do $$
begin
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' and table_name = 'emails' and column_name = 'is_incoming') then
    create trigger trg_inbound_email_ai_sdr
      after insert on public.emails
      for each row
      when (NEW.is_incoming = true)
      execute function public.handle_inbound_email_for_ai_sdr();
  end if;
end $$;

-- ============================================================================
-- 6️⃣ Helper function to get conversation history
-- ============================================================================

create or replace function public.get_thread_messages(p_thread_id uuid)
returns table (
  id uuid,
  subject text,
  body_text text,
  body_html text,
  is_inbound boolean,
  created_at timestamptz
)
language plpgsql
security definer
as $$
declare
  v_lead_id uuid;
  v_campaign_id uuid;
begin
  select lead_id, campaign_id into v_lead_id, v_campaign_id
  from public.ai_sdr_threads
  where id = p_thread_id;

  return query
  select 
    e.id,
    e.subject,
    e.body_text,
    e.body_html,
    coalesce(e.is_inbound, false) as is_inbound,
    e.created_at
  from public.emails e
  where e.lead_id = v_lead_id
    and (v_campaign_id is null or e.campaign_id = v_campaign_id)
  order by e.created_at asc;
end;
$$;

comment on function public.get_thread_messages is 'Returns all email messages for a given AI SDR thread';

