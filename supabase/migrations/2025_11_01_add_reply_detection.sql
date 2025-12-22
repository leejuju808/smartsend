-- Lead-level flags

alter table leads
  add column if not exists is_replied boolean default false,
  add column if not exists last_reply_at timestamptz,
  add column if not exists reply_intent text check (reply_intent in ('positive','neutral','negative','ooo','unsubscribe') or reply_intent is null);

-- Store inbound messages (if not created yet)
create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  message_id text,              -- provider message id
  provider text check (provider in ('gmail','outlook')) not null,
  from_email text not null,
  to_email text not null,
  subject text,
  body text,                     -- plain or html-stripped
  received_at timestamptz not null default now(),
  detected_intent text check (detected_intent in ('positive','neutral','negative','ooo','unsubscribe') or detected_intent is null),
  created_at timestamptz not null default now()
);

create index if not exists replies_lead_id_idx on replies(lead_id);
create index if not exists replies_received_at_idx on replies(received_at);

-- Helper view for latest reply per lead
create or replace view lead_latest_reply as
select r.*
from replies r
join (
  select lead_id, max(received_at) as max_received
  from replies
  group by lead_id
) m on m.lead_id = r.lead_id and m.max_received = r.received_at;

