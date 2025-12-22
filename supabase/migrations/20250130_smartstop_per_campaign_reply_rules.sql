-- Block 394 — SmartStop per-Campaign Reply Rules v1
-- Add auto_stop_on_any_reply column to campaigns table

alter table public.campaigns
add column if not exists auto_stop_on_any_reply boolean not null default true;

-- Optional: index if you'll filter on this in admin views
create index if not exists idx_campaigns_auto_stop_on_any_reply
  on public.campaigns (auto_stop_on_any_reply);




