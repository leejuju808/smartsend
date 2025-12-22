-- store raw inbound messages for auditing

create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  from_email text not null,
  to_email text,
  subject text,
  body text,
  thread_id text,
  in_reply_to text,
  headers jsonb,
  received_at timestamptz not null default now(),
  campaign_id uuid,
  lead_id uuid,
  is_human_reply boolean,
  ai_confidence numeric,
  ai_reason text
);

-- faster lookup by from_email and recent time
create index if not exists idx_inbound_from_email on public.inbound_emails (from_email);

-- track when we detected a reply
alter table public.leads
  add column if not exists replied_at timestamptz;


