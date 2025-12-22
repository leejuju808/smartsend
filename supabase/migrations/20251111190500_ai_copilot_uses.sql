create table if not exists public.ai_copilot_uses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id),
  thread_id uuid references public.inbox_threads(id) on delete set null,
  action text not null,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  ok boolean not null default true,
  error text
);

comment on column public.ai_copilot_uses.action is 'shorten|expand|clarify|friendlier|formal|bulletize|fix|custom|error';

create index if not exists idx_ai_copilot_uses_created_at on public.ai_copilot_uses(created_at);







