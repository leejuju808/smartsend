-- 8220 - Global suppression list for SmartSend

create table if not exists public.global_suppressions (
  id uuid primary key default gen_random_uuid(),

  org_id uuid,
  email text not null,
  reason text not null, -- unsubscribe, negative_reply, manual, bounce, etc.
  source text,          -- system, user, ai, webhook
  campaign_id uuid,
  queue_id uuid,
  created_at timestamptz not null default now(),

  -- normalized for clean dedupe
  email_normalized text generated always as (lower(trim(email))) stored
);

-- unique per org + email
create unique index if not exists idx_global_suppressions_unique
  on public.global_suppressions (org_id, email_normalized);

-- fast lookups for enqueue
create index if not exists idx_global_suppressions_email
  on public.global_suppressions (email_normalized);

































































