-- 03_reply_detection.sql

-- Inbound webhook log (raw)
create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                           -- "gmail" | "outlook" | "sendgrid" | "resend" | etc.
  payload jsonb not null,                           -- raw webhook body
  from_email text,
  to_email text,
  subject text,
  body text,
  thread_id text,                                   -- provider thread/conversation id if available
  created_at timestamptz not null default now()
);

create index if not exists idx_inbound_created_at on public.inbound_messages (created_at desc);

-- Event log
create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  lead_id uuid,
  event text not null,                              -- 'reply_detected' | 'requeue' | etc.
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_logs_campaign on public.campaign_logs (campaign_id, created_at desc);
create index if not exists idx_campaign_logs_lead on public.campaign_logs (lead_id, created_at desc);

-- Helpful: ensure leads has status + email index
create index if not exists idx_leads_email on public.leads (email);
create index if not exists idx_leads_status on public.leads (status);

-- Helpful view (joins queue+lead) if not already created:
create or replace view public.send_queue_view as
select
  sq.*,
  l.email,
  l.company,
  l.first_name,
  l.last_name
from public.send_queue sq
left join public.leads l on l.id = sq.lead_id;

-- Optional: RLS policies (adjust to your model—example grants read, not required for service role)
-- alter table public.inbound_messages enable row level security;
-- alter table public.campaign_logs enable row level security;

