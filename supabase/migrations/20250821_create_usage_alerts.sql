create table if not exists public.usage_alerts (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  last_alert_at timestamptz not null,
  primary key (user_id, kind)
);

comment on table public.usage_alerts is 'Tracks last quota alert per user/kind to avoid spamming';
