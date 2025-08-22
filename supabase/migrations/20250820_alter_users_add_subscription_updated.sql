alter table public.users add column if not exists subscription_updated_at timestamptz;
create index if not exists idx_users_subscription_updated_at on public.users (subscription_updated_at desc);
