alter table if exists public.campaign_logs
  add column if not exists is_test boolean default false;
