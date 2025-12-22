-- Campaign Shares RLS Helpers & Policies
-- Adds is_campaign_owner helper and updates RLS policies per spec

-- Helper: Check if user is campaign owner
create or replace function public.is_campaign_owner(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from public.campaigns c
    where c.id = p_campaign and c.user_id = auth.uid()
  );
$$;

-- Helper: Check if user can edit campaign (owner or editor)
create or replace function public.can_edit_campaign(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select
    coalesce(
      (select public.is_campaign_owner(p_campaign)),
      false
    )
    or exists(
      select 1
      from public.campaign_shares s
      where s.campaign_id = p_campaign
        and s.user_id = auth.uid()
        and s.role in ('editor')
    );
$$;

-- RLS on campaign_shares (reads for anyone who can view; writes only owner)
alter table public.campaign_shares enable row level security;

drop policy if exists "shares_read" on public.campaign_shares;
create policy "shares_read"
on public.campaign_shares for select
using ( public.can_view_campaign(campaign_id) );

drop policy if exists "shares_insert" on public.campaign_shares;
create policy "shares_insert"
on public.campaign_shares for insert
with check ( public.is_campaign_owner(campaign_id) );

drop policy if exists "shares_update" on public.campaign_shares;
create policy "shares_update"
on public.campaign_shares for update
using ( public.is_campaign_owner(campaign_id) )
with check ( public.is_campaign_owner(campaign_id) );

drop policy if exists "shares_delete" on public.campaign_shares;
create policy "shares_delete"
on public.campaign_shares for delete
using ( public.is_campaign_owner(campaign_id) );

-- Nice-to-have: index for list queries
create index if not exists idx_campaign_shares_campaign_user
  on public.campaign_shares(campaign_id, user_id);





