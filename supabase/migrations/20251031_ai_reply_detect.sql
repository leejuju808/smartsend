-- AI Reply Detection System
-- Creates queue, logs, trigger for auto-detecting human replies and canceling future sends

-- 1. Queue for AI checks
create table if not exists public.ai_check_queue (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  lead_id uuid not null,
  campaign_id uuid,
  enqueued_at timestamptz not null default now(),
  processed_at timestamptz,
  result jsonb
);

create index if not exists idx_ai_check_queue_unprocessed on public.ai_check_queue(processed_at) where processed_at is null;
create index if not exists idx_ai_check_queue_message on public.ai_check_queue(message_id);
create index if not exists idx_ai_check_queue_lead on public.ai_check_queue(lead_id);
-- Unique constraint to prevent duplicate queue entries for same message (only one per message)
-- We allow reprocessing after processed_at is set, but prevent duplicate unprocessed entries
do $$
begin
  -- Try to create unique index on message_id for unprocessed entries
  create unique index if not exists idx_ai_check_queue_message_unique 
    on public.ai_check_queue(message_id) 
    where processed_at is null;
exception when others then null;
end $$;

-- 2. Campaign logs (if not exists)
create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  lead_id uuid,
  event text not null, -- e.g., 'reply_detected'
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_logs_campaign on public.campaign_logs(campaign_id);
create index if not exists idx_campaign_logs_lead on public.campaign_logs(lead_id);
create index if not exists idx_campaign_logs_event on public.campaign_logs(event);

-- 3. Ensure leads.status includes 'replied' enum value
do $$
begin
  -- Check if lead_status enum exists
  if exists (
    select 1 from pg_type t 
    join pg_namespace n on n.oid = t.typnamespace 
    where t.typname = 'lead_status'
  ) then
    -- Try to add 'replied' if it doesn't exist
    if not exists (
      select 1 from pg_type t 
      join pg_enum e on t.oid = e.enumtypid 
      where t.typname = 'lead_status' and e.enumlabel = 'replied'
    ) then
      alter type lead_status add value if not exists 'replied';
    end if;
  else
    -- If enum doesn't exist, create it
    create type lead_status as enum ('new','queued','sending','sent','failed','replied');
    -- Try to alter the column if it exists
    do $$
    begin
      if exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' and table_name = 'leads' and column_name = 'status'
      ) then
        -- Alter column type (may fail if there's incompatible data, adjust as needed)
        alter table public.leads alter column status type lead_status using status::text::lead_status;
      end if;
    exception when others then
      -- If conversion fails, leave as is - status might be text
      null;
    end $$;
  end if;
exception when others then null;
end $$;

-- 4. Trigger: when an inbound message arrives, enqueue it for AI check
create or replace function public.fn_enqueue_ai_check() returns trigger as $$
begin
  if (new.direction = 'in') then
    -- Insert only if not already queued and unprocessed
    -- The unique index will prevent duplicates, but we check first to avoid errors
    if not exists (
      select 1 from public.ai_check_queue 
      where message_id = new.id and processed_at is null
    ) then
      insert into public.ai_check_queue (message_id, lead_id, campaign_id)
      values (new.id, new.lead_id, new.campaign_id);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_enqueue_ai_check on public.email_messages;
create trigger trg_enqueue_ai_check
after insert on public.email_messages
for each row execute function public.fn_enqueue_ai_check();

-- 5. Grant necessary permissions
grant insert, select, update on public.ai_check_queue to authenticated;
grant insert, select on public.campaign_logs to authenticated;

-- Allow service role full access
grant all on public.ai_check_queue to service_role;
grant all on public.campaign_logs to service_role;

