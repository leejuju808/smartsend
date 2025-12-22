-- Add sequence_order to campaign_emails table
-- This allows each email in a campaign to know its order in the sequence

-- Create campaign_emails table if it doesn't exist
create table if not exists public.campaign_emails (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  subject text not null,
  body text not null,
  sequence_order int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add sequence_order column if table exists but column doesn't
alter table public.campaign_emails
  add column if not exists sequence_order int default 1;

-- Create index for efficient queries by campaign and sequence
create index if not exists idx_campaign_emails_campaign_sequence 
  on public.campaign_emails(campaign_id, sequence_order);

-- Enable RLS if not already enabled
alter table public.campaign_emails enable row level security;

-- Create policy for service role (for edge functions)
drop policy if exists "campaign_emails_service_role" on public.campaign_emails;
create policy "campaign_emails_service_role" on public.campaign_emails
  for all to service_role using (true) with check (true);

-- Create policy for authenticated users (assuming they can access their workspace campaigns)
drop policy if exists "campaign_emails_authenticated" on public.campaign_emails;
create policy "campaign_emails_authenticated" on public.campaign_emails
  for select to authenticated using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_emails.campaign_id
    )
  );

