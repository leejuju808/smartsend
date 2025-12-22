create table if not exists public.reply_summaries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  thread_id uuid not null references public.threads(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  summary text not null,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  intent text,
  suggested_action jsonb not null,
  model text not null default 'gpt-4o-mini',
  tokens int,
  latency_ms int
);

create index if not exists idx_reply_summaries_thread on public.reply_summaries(thread_id, created_at desc);

create table if not exists public.thread_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  thread_id uuid unique not null references public.threads(id) on delete cascade,
  subject text not null,
  body text not null
);




