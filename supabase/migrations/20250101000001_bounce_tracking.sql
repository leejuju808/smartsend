-- Track bounce events
create table if not exists bounces (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  provider text check (provider in ('gmail','outlook')) not null,
  message_id text,          -- outbound message id that bounced (if known)
  thread_id text,           -- gmail threadId or outlook conversationId
  bounce_type text,         -- 'hard' | 'soft' | 'unknown'
  reason text,              -- parsed summary
  raw_snippet text,         -- short excerpt for UI
  created_at timestamptz default now()
);

create index if not exists idx_bounces_lead on bounces(lead_id);
alter table bounces enable row level security;

-- RLS: owners see bounces for their leads
create policy if not exists "bounces_select_own"
on bounces for select
using (exists(select 1 from leads l where l.id = bounces.lead_id and l.owner_id = auth.uid()));

-- Optional: extend leads.status enum; else use text
-- alter table leads add constraint leads_status_chk check (status in ('Active','Replied','Bounced'));

-- helpful lead fields
alter table leads add column if not exists bounced_at timestamptz;