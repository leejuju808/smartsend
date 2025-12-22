-- Preflight System: Add columns for campaign launch guardrails
-- Optional: store last test-send timestamp per mailbox
alter table public.connected_accounts
  add column if not exists last_test_send_at timestamptz;

-- Optional: per-campaign waiver (allows override launch)
alter table public.campaigns
  add column if not exists launch_override boolean default false;

