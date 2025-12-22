-- Campaign Access View and Support
-- Creates unified access view for campaigns with role info and soft delete support

-- ============================================
-- 1) Add deleted_at column for soft deletes
-- ============================================
alter table public.campaigns
  add column if not exists deleted_at timestamptz;

-- ============================================
-- 2) Add updated_at column if missing
-- ============================================
alter table public.campaigns
  add column if not exists updated_at timestamptz default now();

-- Create trigger to update updated_at
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_campaigns_updated_at on public.campaigns;
create trigger update_campaigns_updated_at
  before update on public.campaigns
  for each row
  execute function public.update_updated_at_column();

-- ============================================
-- 3) Ensure name column exists (handle both name and title)
-- ============================================
do $$
begin
  -- If name doesn't exist but title does, rename it
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'name') then
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'campaigns' and column_name = 'title') then
      alter table public.campaigns rename column title to name;
    else
      -- Neither exists, add name
      alter table public.campaigns add column name text;
    end if;
  end if;
end $$;

-- ============================================
-- 4) Create unified access view
-- ============================================
create or replace view public.v_campaign_access as
select
  c.id,
  coalesce(c.name, 'Untitled Campaign') as name,
  c.user_id as owner_id,
  c.deleted_at,
  c.created_at,
  coalesce(c.updated_at, c.created_at) as updated_at,
  public.user_campaign_role(c.id) as role,
  public.can_edit_campaign(c.id) as can_edit
from public.campaigns c
where public.can_view_campaign(c.id);

-- Grant access to authenticated users
grant select on public.v_campaign_access to authenticated;

-- ============================================
-- 5) Helpful indexes for sorting/filtering
-- ============================================
create index if not exists idx_campaigns_deleted_at on public.campaigns(deleted_at);
create index if not exists idx_campaigns_updated_at on public.campaigns(updated_at);
create index if not exists idx_campaigns_name on public.campaigns(name);

-- ============================================
-- 6) Campaign counts function (optional, for tab badges)
-- ============================================
create or replace function public.campaign_counts()
returns table (all_count int, owned_count int, shared_count int, archived_count int)
language sql
stable
security definer
as $$
with base as (
  select 
    c.*, 
    (c.user_id = auth.uid()) as is_owner
  from public.campaigns c
  where public.can_view_campaign(c.id)
)
select
  count(*) filter (where deleted_at is null)::int as all_count,
  count(*) filter (where is_owner and deleted_at is null)::int as owned_count,
  count(*) filter (where not is_owner and deleted_at is null)::int as shared_count,
  count(*) filter (where deleted_at is not null)::int as archived_count
from base;
$$;

-- Grant execute permission
grant execute on function public.campaign_counts() to authenticated;

