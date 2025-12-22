-- Block 178 — AI SmartLists (GPT-Powered Dynamic Segments That Auto-Adapt Daily)
-- Add columns to shared_resources to support AI-driven dynamic segments

-- 1) Add smart boolean flag to indicate AI SmartList
alter table public.shared_resources
  add column if not exists smart boolean default false;

-- 2) Add llm_prompt column for user intent description
alter table public.shared_resources
  add column if not exists llm_prompt text;

-- 3) Add llm_rules column to store AI-generated rules (JSONB)
alter table public.shared_resources
  add column if not exists llm_rules jsonb default '{}'::jsonb;

-- 4) Add last_refreshed timestamp to track when SmartList was last updated
alter table public.shared_resources
  add column if not exists last_refreshed timestamptz;

-- 5) Create index for faster SmartList lookups
create index if not exists idx_shared_resources_smartlists
  on public.shared_resources (smart, kind)
  where smart = true and kind = 'saved_view';

-- 6) Add comments for documentation
comment on column public.shared_resources.smart is 'Whether this is an AI SmartList that auto-updates based on LLM analysis';
comment on column public.shared_resources.llm_prompt is 'User intent description for AI SmartList (e.g., "Find high-intent leads for construction companies")';
comment on column public.shared_resources.llm_rules is 'AI-generated segment rules in JSONB format, updated daily by LLM';
comment on column public.shared_resources.last_refreshed is 'Timestamp of last automatic SmartList refresh';












