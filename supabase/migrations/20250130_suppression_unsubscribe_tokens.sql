-- 03_suppression.sql
create table if not exists email_suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  reason text not null default 'unsubscribed', -- unsubscribed | bounced | complaint | manual
  created_at timestamptz not null default now(),
  unique(user_id, email)
);
alter table email_suppressions enable row level security;
create policy "own suppressions" on email_suppressions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists unsubscribe_tokens (
  token text primary key, -- random 32+ chars
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  campaign_id uuid,
  created_at timestamptz not null default now(),
  unique(user_id, email) -- one reusable token per contact per user
);
alter table unsubscribe_tokens enable row level security;
create policy "own tokens" on unsubscribe_tokens
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- small tweak to jobs to hold a precomputed token for fast footer building
alter table email_jobs
  add column if not exists unsub_token text;

create index if not exists suppressions_user_email_idx
  on email_suppressions (user_id, email);