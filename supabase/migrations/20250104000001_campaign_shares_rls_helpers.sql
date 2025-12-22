-- Campaign Shares RLS and Helper Functions
-- Adds v_campaign_members view and updates RLS policies

-- Ensure campaign_shares table exists (if not already present from earlier slice)
create table if not exists public.campaign_shares (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer','editor')),
  unique (campaign_id, user_id)
);

create index if not exists idx_campaign_shares_campaign on public.campaign_shares(campaign_id);
create index if not exists idx_campaign_shares_user on public.campaign_shares(user_id);

-- Compute effective role: owner > editor > viewer
create or replace function public.user_campaign_role(p_campaign uuid)
returns text
language sql stable as $$
  with mine as (
    select 'owner'::text as role
    from public.campaigns c
    where c.id = p_campaign and c.user_id = auth.uid()
  ),
  shared as (
    select s.role
    from public.campaign_shares s
    where s.campaign_id = p_campaign and s.user_id = auth.uid()
  )
  select coalesce(
    (select role from mine limit 1),
    (select role from shared limit 1),
    null
  );
$$;

-- Convenience view: members (owner + shares)
create or replace view public.v_campaign_members as
select
  c.id as campaign_id,
  c.user_id as owner_id,
  c.user_id as user_id,
  'owner'::text as role
from public.campaigns c
union all
select
  s.campaign_id, 
  (select user_id from public.campaigns c where c.id = s.campaign_id),
  s.user_id, 
  s.role
from public.campaign_shares s;

-- RLS
alter table public.campaign_shares enable row level security;

drop policy if exists sel_shares on public.campaign_shares;
create policy sel_shares on public.campaign_shares
for select to authenticated
using ( public.user_campaign_role(campaign_id) is not null );

drop policy if exists ins_shares on public.campaign_shares;
create policy ins_shares on public.campaign_shares
for insert to authenticated
with check (
  -- only owners can add shares
  exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
);

drop policy if exists upd_shares on public.campaign_shares;
create policy upd_shares on public.campaign_shares
for update to authenticated
using (
  exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
)
with check (
  exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
);

drop policy if exists del_shares on public.campaign_shares;
create policy del_shares on public.campaign_shares
for delete to authenticated
using (
  exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
);



