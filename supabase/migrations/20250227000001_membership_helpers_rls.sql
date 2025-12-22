-- A) Canonical membership helpers (stable)

create or replace function public.can_view_campaign(p_campaign uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_campaign(p_campaign uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign
      and cm.user_id = auth.uid()
      and cm.role in ('owner','editor')
  );
$$;

create or replace function public.is_campaign_owner(p_campaign uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign
      and cm.user_id = auth.uid()
      and cm.role = 'owner'
  );
$$;

-- B) Enforce a mirrored owner row (if campaigns has campaigns.user_id)
--   Ensures exactly one owner in campaign_members.
create or replace function public._ensure_owner_membership()
returns trigger language plpgsql as $$
begin
  -- add/mirror owner
  insert into public.campaign_members(campaign_id, user_id, role)
  values (NEW.id, NEW.user_id, 'owner')
  on conflict (campaign_id, user_id) do update set role = 'owner';
  return NEW;
end $$;

drop trigger if exists trg_campaign_owner_member on public.campaigns;
create trigger trg_campaign_owner_member
after insert on public.campaigns
for each row execute function public._ensure_owner_membership();

-- C) Keep a single owner (downgrade others if someone becomes owner)
create or replace function public._campaign_owner_guard()
returns trigger language plpgsql as $$
begin
  if NEW.role = 'owner' then
    update public.campaign_members
       set role = 'editor'
     where campaign_id = NEW.campaign_id
       and user_id <> NEW.user_id
       and role = 'owner';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_owner_guard on public.campaign_members;
create trigger trg_owner_guard
after insert or update of role on public.campaign_members
for each row execute function public._campaign_owner_guard();

-- D) RLS on campaign_members
alter table public.campaign_members enable row level security;

drop policy if exists cm_view on public.campaign_members;
create policy cm_view on public.campaign_members
for select using (
  public.can_view_campaign(campaign_id)
);

drop policy if exists cm_manage on public.campaign_members;
create policy cm_manage on public.campaign_members
for insert with check ( public.is_campaign_owner(campaign_id) )
, for update using ( public.is_campaign_owner(campaign_id) )
, for delete using ( public.is_campaign_owner(campaign_id) );

-- E) Ensure dependent tables honor membership (if not already)
-- Example for campaigns (view-only listing)
alter table public.campaigns enable row level security;

drop policy if exists campaigns_view on public.campaigns;
create policy campaigns_view on public.campaigns
for select using ( public.can_view_campaign(id) );

-- (Editing campaigns rows)
drop policy if exists campaigns_edit on public.campaigns;
create policy campaigns_edit on public.campaigns
for update using ( public.can_edit_campaign(id) );

-- Example for inbox_threads (read via membership)
alter table public.inbox_threads enable row level security;
drop policy if exists threads_view on public.inbox_threads;
create policy threads_view on public.inbox_threads
for select using ( public.can_view_campaign(campaign_id) );

-- F) Friendly view for memberships
create or replace view public.v_campaign_members as
select
  cm.campaign_id,
  cm.user_id,
  cm.role,
  u.email,
  u.raw_user_meta_data->>'name' as name,
  cm.created_at
from public.campaign_members cm
left join auth.users u on u.id = cm.user_id;

drop policy if exists v_cm_view on public.v_campaign_members;
alter view public.v_campaign_members set (security_invoker = true);

