-- Inbound email storage for reply detection
-- This table stores all inbound emails and classifies them for reply detection

create table if not exists inbound_emails (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                         -- 'resend' | 'gmail' | etc.
  provider_message_id text not null,              -- unique per provider
  from_email text not null,
  subject text,
  body_text text,
  body_html text,
  campaign_id uuid references campaigns(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  is_reply boolean not null default false,
  classification text,                            -- 'real_reply' | 'auto_reply' | 'bounce' | 'unknown'
  created_at timestamptz not null default now()
);

create unique index if not exists uq_inbound_provider_msg
  on inbound_emails(provider, provider_message_id);

create index if not exists idx_inbound_from_email
  on inbound_emails(from_email);

-- Helpful indexes for fast updates
create index if not exists idx_leads_email on leads(email);
create index if not exists idx_logs_lead_event on campaign_logs(lead_id, event);

-- (Optional) If leads.status isn't constrained, you can keep it text.
-- Ensure 'replied' is a valid state in your app.
-- Assumes you already have campaign_logs with event in ('queued','sent','failed','replied').

-- Add RLS policies
alter table inbound_emails enable row level security;

-- Allow service role to manage all records
create policy "Service can manage inbound_emails"
on inbound_emails
for all
using (true)
with check (true); 