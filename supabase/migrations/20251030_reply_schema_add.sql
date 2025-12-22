-- Reply Detection — Leads external threading columns and helpful indices

-- Track external threads to map replies (Gmail/Outlook/your MTA)
alter table if exists public.leads
  add column if not exists external_thread_id text,
  add column if not exists external_message_id text;

-- Indices to speed up lookups by thread and by (email,campaign)
create index if not exists leads_thread_idx on public.leads (external_thread_id);
create index if not exists leads_email_campaign_idx on public.leads (email, campaign_id);

-- Optional compatibility queue (noop if already using campaign_send_queue)
-- If your system already uses campaign_send_queue, this section is safe and will not conflict
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  campaign_id uuid not null,
  status text not null check (status in ('queued','scheduled','sending','sent','canceled','failed')),
  reason text,
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists send_queue_lead_status_idx on public.send_queue (lead_id, status);


