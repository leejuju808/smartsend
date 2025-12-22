-- Block 8450 — Lead Intent Webhook Sync (Real-Time Status Push to Dashboard)
-- DB event stream table + trigger for real-time lead intent updates

-- 1. Lead Intent Events table
create table if not exists public.lead_intent_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  account_id uuid not null,
  campaign_id uuid,
  contact_id uuid,
  thread_id uuid,
  message_id uuid,

  intent text not null,
  confidence numeric(5,2),
  raw_payload jsonb
);

-- Optional: indexes for fast lookups
create index if not exists idx_lead_intent_events_account_created
  on public.lead_intent_events (account_id, created_at desc);

create index if not exists idx_lead_intent_events_campaign
  on public.lead_intent_events (campaign_id);

-- Enable RLS
alter table public.lead_intent_events enable row level security;

-- RLS Policy: Users can see events for accounts they have access to
-- Adjust this based on your auth model (workspace_id, account_id, etc.)
create policy if not exists lead_intent_events_select
  on public.lead_intent_events
  for select
  using (
    exists (
      select 1
      from public.campaigns c
      where c.id = lead_intent_events.campaign_id
      -- Add your access check here based on your auth model
      -- For example: and c.account_id in (select account_id from team_members where user_id = auth.uid())
    )
    or account_id in (
      select account_id
      from public.team_members
      where user_id = auth.uid()
    )
  );

-- 2. Trigger function: log on reply intent change
-- This watches campaign_replies table (updated by Block 8340)
create or replace function public.log_lead_intent_event()
returns trigger
language plpgsql
as $$
declare
  v_account_id uuid;
  v_contact_id uuid;
  v_thread_id uuid;
begin
  -- Only log when intent is present and either:
  --  - a brand new reply
  --  - or the intent changed from previous value
  if (TG_OP = 'INSERT' and NEW.intent is not null)
     or (TG_OP = 'UPDATE'
         and NEW.intent is not null
         and (OLD.intent is distinct from NEW.intent)) then

    -- Get account_id from campaign
    select c.account_id into v_account_id
    from public.campaigns c
    where c.id = NEW.campaign_id
    limit 1;

    -- If campaigns doesn't have account_id, try to get from workspace
    if v_account_id is null then
      select w.account_id into v_account_id
      from public.campaigns c
      join public.workspaces w on w.id = c.workspace_id
      where c.id = NEW.campaign_id
      limit 1;
    end if;

    -- Fallback: if still null, try to get from lead
    if v_account_id is null and NEW.lead_id is not null then
      select l.account_id into v_account_id
      from public.leads l
      where l.id = NEW.lead_id
      limit 1;
    end if;

    -- Use lead_id as contact_id
    v_contact_id := NEW.lead_id;

    -- Try to get thread_id from campaign_leads or other sources
    -- This is a placeholder - adjust based on your schema
    select cl.thread_id into v_thread_id
    from public.campaign_leads cl
    where cl.campaign_id = NEW.campaign_id
      and cl.lead_id = NEW.lead_id
    limit 1;

    -- Only insert if we have an account_id
    if v_account_id is not null then
      insert into public.lead_intent_events (
        account_id,
        campaign_id,
        contact_id,
        thread_id,
        message_id,
        intent,
        confidence,
        raw_payload
      )
      values (
        v_account_id,
        NEW.campaign_id,
        v_contact_id,
        v_thread_id,
        NEW.id,              -- campaign_replies.id as message_id
        NEW.intent::text,    -- Convert enum to text
        NEW.intent_confidence,
        to_jsonb(NEW)
      );
    end if;
  end if;

  return NEW;
end;
$$;

-- 3. Attach trigger to campaign_replies
drop trigger if exists trg_log_lead_intent_event on public.campaign_replies;

create trigger trg_log_lead_intent_event
after insert or update on public.campaign_replies
for each row
execute function public.log_lead_intent_event();

-- Note: This trigger watches campaign_replies table which is updated by Block 8340
-- The intent values come from the reply_intent enum: 'positive', 'neutral', 'negative', etc.
-- You may want to map these to HOT/WARM/FOLLOW_UP/NOT_INTERESTED in your application layer
-- or add a mapping function here if needed.






























































