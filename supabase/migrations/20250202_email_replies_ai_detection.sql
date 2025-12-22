-- Add AI reply detection columns to email_replies table
-- This migration ensures email_replies has all fields needed for AI classification

-- Add columns if they don't exist
alter table if exists public.email_replies
  add column if not exists lead_id uuid references leads(id) on delete cascade,
  add column if not exists campaign_id uuid references campaigns(id) on delete cascade,
  add column if not exists message_id text,
  add column if not exists from_email text,
  add column if not exists ai_classification text check (ai_classification in ('positive', 'neutral', 'negative', 'unsubscribe') or ai_classification is null);

-- Create indexes for better query performance
create index if not exists idx_email_replies_lead_id on public.email_replies(lead_id);
create index if not exists idx_email_replies_campaign_id on public.email_replies(campaign_id);
create index if not exists idx_email_replies_message_id on public.email_replies(message_id);
create index if not exists idx_email_replies_from_email on public.email_replies(from_email);
create index if not exists idx_email_replies_ai_classification on public.email_replies(ai_classification);

-- Update from_email from sender column if it exists and from_email is null
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_replies' 
    and column_name = 'sender'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_replies' 
    and column_name = 'from_email'
  ) then
    update public.email_replies 
    set from_email = sender 
    where from_email is null and sender is not null;
  end if;
end $$;

