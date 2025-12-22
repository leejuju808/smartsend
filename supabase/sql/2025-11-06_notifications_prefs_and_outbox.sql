-- Notification preferences and outbox (idempotent)
create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  slack_enabled boolean not null default false,
  telegram_enabled boolean not null default false,
  email text,
  slack_webhook text,
  telegram_bot_token text,
  telegram_chat_id text,
  on_hot_reply boolean not null default true,
  on_overdue_task boolean not null default true,
  on_new_task boolean not null default false,
  quiet_hours jsonb not null default '{"start":"22:00","end":"07:00","tz":"America/Los_Angeles"}'::jsonb
);

create table if not exists public.notifications_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('hot_reply','overdue_task','new_task')),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  task_id uuid references public.followup_tasks(id) on delete set null,
  payload jsonb not null,
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz
);

create index if not exists idx_notifications_outbox_pending on public.notifications_outbox(sent_at) where sent_at is null;











