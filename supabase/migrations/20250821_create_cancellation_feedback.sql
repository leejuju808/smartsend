create table if not exists public.cancellation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cancellation_feedback_user_time on public.cancellation_feedback (user_id, created_at desc);
comment on table public.cancellation_feedback is 'User-provided cancel reasons captured before portal cancellation';
