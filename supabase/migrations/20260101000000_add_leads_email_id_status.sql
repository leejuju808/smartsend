-- Add email_id, update status check constraint and add index for replies inbox
-- This migration ensures leads table has the necessary columns for reply tracking

-- Add email_id column if it doesn't exist
alter table public.leads
  add column if not exists email_id text unique;

-- Update status check constraint to include the required values for reply tracking
alter table public.leads
  drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check 
  check (status in ('Queued','Sending','Sent','Bounced','Replied','Archived','new','queued','replied','unsubscribed','bounced','sending','sent','failed'));

-- Add status index for efficient filtering
create index if not exists idx_leads_status on public.leads(status);

-- Add last_message_snippet if it doesn't exist for displaying message preview
alter table public.leads
  add column if not exists last_message_snippet text;

-- Add name column if it doesn't exist (derived from first_name/last_name)
alter table public.leads
  add column if not exists name text;

-- Create trigger to populate name from first_name/last_name if available
create or replace function public.set_lead_name()
returns trigger language plpgsql as $$
begin
  if new.first_name is not null or new.last_name is not null then
    new.name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  end if;
  return new;
end $$;

drop trigger if exists trg_leads_set_name on public.leads;
create trigger trg_leads_set_name
  before insert or update on public.leads
  for each row execute function public.set_lead_name();

