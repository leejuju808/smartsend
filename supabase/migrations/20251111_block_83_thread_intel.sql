-- 1) Objection taxonomy (idempotent)
create table if not exists public.objection_tags (
  key text primary key,
  label text not null
);

insert into public.objection_tags(key, label) values
  ('price', 'Pricing/Budget'),
  ('timing', 'Timing/Priority'),
  ('feature', 'Missing Feature'),
  ('authority', 'No Authority'),
  ('competitor', 'Uses Competitor'),
  ('irrelevant', 'Not Relevant'),
  ('legal', 'Legal/Compliance'),
  ('security', 'Security/IT Review')
on conflict (key) do nothing;

-- 2) Thread insights (one per thread snapshot)
create table if not exists public.thread_insights (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  thread_id uuid not null,
  lead_id uuid references public.leads(id) on delete set null,
  last_message_id uuid references public.messages(id) on delete set null,
  summary text,
  stance text check (stance in ('positive', 'neutral', 'oos', 'ooo', 'bounce', 'meeting_intent')),
  sentiment smallint,
  confidence numeric check (confidence between 0 and 1),
  nba_key text,
  nba_payload jsonb not null default '{}'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  unique (account_id, thread_id)
);

-- 3) Mapping: which objections apply to this thread
create table if not exists public.thread_objections (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  thread_id uuid not null,
  tag_key text not null references public.objection_tags(key) on delete restrict,
  confidence numeric not null default 0.7,
  unique (account_id, thread_id, tag_key)
);

-- 4) RLS (adapt tenant model if different)
alter table public.thread_insights enable row level security;

create policy thread_insights_iso on public.thread_insights
  using (account_id = auth.uid());

alter table public.thread_objections enable row level security;

create policy thread_obj_iso on public.thread_objections
  using (account_id = auth.uid());

