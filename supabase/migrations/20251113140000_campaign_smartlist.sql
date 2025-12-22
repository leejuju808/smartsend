-- Block 179 — SmartList Auto-Sync to Campaigns (Attach SmartLists + Daily Auto-Updated Audiences)
-- Add SmartList support to campaigns for autonomous AI-driven audience management

-- 1) Add smartlist_id column to campaigns table
alter table public.campaigns
  add column if not exists smartlist_id uuid references public.shared_resources(id) on delete set null;

-- 2) Add auto_refresh column to allow users to freeze audience or keep updating daily
alter table public.campaigns
  add column if not exists auto_refresh boolean default true;

-- 3) Create index for faster lookups of campaigns using SmartLists
create index if not exists idx_campaigns_smartlist
  on public.campaigns (smartlist_id)
  where smartlist_id is not null;

-- 4) Create index for daily sync queries (campaigns with auto_refresh enabled)
create index if not exists idx_campaigns_auto_refresh
  on public.campaigns (auto_refresh, smartlist_id)
  where auto_refresh = true and smartlist_id is not null;

-- 5) Add comments for documentation
comment on column public.campaigns.smartlist_id is 'Attached SmartList (AI-generated dynamic segment) that auto-updates campaign audience';
comment on column public.campaigns.auto_refresh is 'Whether to automatically refresh campaign audience daily using updated SmartList rules';












