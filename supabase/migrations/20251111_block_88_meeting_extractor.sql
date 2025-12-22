-- Block 88: Meeting extractor drafts + helpers

-- 1) Drafts produced from replies (awaiting user confirm)
create table if not exists public.meeting_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  thread_id uuid not null,
  message_id uuid not null references public.messages(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- normalized proposal
  title text not null default 'Intro call',
  duration_minutes int not null default 30,
  tz_ianna text,
  windows jsonb not null default '[]'::jsonb,
  location text,
  conferencing jsonb not null default '{}'::jsonb,
  notes text,
  confidence numeric not null default 0.8,
  status text not null default 'draft' check (status in ('draft','sent','dismissed'))
);

create index if not exists idx_meeting_drafts_thread on public.meeting_drafts(thread_id);

alter table public.meeting_drafts enable row level security;

create policy md_iso on public.meeting_drafts using (account_id = auth.uid());

-- 2) Quick source-of-truth TZ getter (signature > lead > default)
create or replace view public.v_lead_best_tz as
select
  l.id as lead_id,
  coalesce(
    l.timezone,
    (
      select sf.timezone
      from public.signature_facts sf
      where sf.lead_id = l.id
      order by sf.created_at desc
      limit 1
    ),
    'America/Los_Angeles'
  ) as tz_ianna
from public.leads l;

