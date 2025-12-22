create type reply_intent as enum (
  'interested','scheduling','referral','neutral',
  'not_interested','unsubscribe','ooo','spam','unknown'
);

create table if not exists public.reply_classifications (
  id uuid primary key default gen_random_uuid(),
  email_log_id uuid not null,
  lead_id uuid not null,
  intent reply_intent not null,
  confidence numeric check (confidence between 0 and 1),
  summary text,
  raw jsonb,
  created_at timestamptz default now()
);

create index if not exists ix_reply_classifications_lead on public.reply_classifications(lead_id, intent, created_at desc);