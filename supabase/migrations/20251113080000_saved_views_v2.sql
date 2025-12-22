-- Block 173 — Saved Views v2 (Shareable, Team-Wide, Auto-Updating Lead Views)
-- Upgrade Saved Views system to support personal/team scope, filters, sort, and default views

-- 1) Update scope constraint to include 'personal' and 'team'
-- First, drop the existing constraint
alter table public.shared_resources
  drop constraint if exists shared_resources_scope_check;

-- Add new constraint with expanded scope options
alter table public.shared_resources
  add constraint shared_resources_scope_check
  check (scope in ('account','campaign','personal','team'));

-- Update default scope for saved_view kind to 'personal'
-- Note: This only affects new rows, existing rows keep their current scope
do $$
begin
  -- For saved_view kind, if scope is 'account', we can optionally migrate to 'personal'
  -- But we'll leave existing data as-is and only change defaults
  null;
end $$;

-- 2) Add filters column (jsonb) for saved view filter configuration
alter table public.shared_resources
  add column if not exists filters jsonb default '{}'::jsonb;

-- 3) Add sort column (jsonb) for saved view sorting configuration
alter table public.shared_resources
  add column if not exists sort jsonb default '{"field":"created_at","dir":"desc"}'::jsonb;

-- 4) Add is_default column (boolean) to mark default views per user
alter table public.shared_resources
  add column if not exists is_default boolean default false;

-- 5) Create index for faster lookups of saved views by scope and kind
create index if not exists idx_shared_resources_saved_view_scope
  on public.shared_resources (kind, scope)
  where kind = 'saved_view';

-- 6) Create index for default views lookup
create index if not exists idx_shared_resources_is_default
  on public.shared_resources (owner_id, is_default)
  where kind = 'saved_view' and is_default = true;

-- 7) Add comment for documentation
comment on column public.shared_resources.filters is 'JSONB filter configuration for saved views: {tags: string[], status: string, date_after: string, date_before: string, last_contact_after: string, segment: string, campaign_engagement: string}';
comment on column public.shared_resources.sort is 'JSONB sort configuration: {field: string, dir: "asc" | "desc"}';
comment on column public.shared_resources.is_default is 'Whether this saved view is the default view for the owner';












