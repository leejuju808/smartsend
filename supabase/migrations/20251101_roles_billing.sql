-- 🔐 Roles + Billing columns

alter table teams
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists seat_limit int,              -- optional: enforce plan caps later
  add column if not exists seat_count int default 1,    -- cached seats for Stripe quantity
  add column if not exists updated_at timestamptz default now();

-- Ensure campaigns belong to teams (already added in Block 23)
-- Indexes for performance
create index if not exists idx_team_members_team_id on team_members(team_id);
create index if not exists idx_team_members_user_id on team_members(user_id);
create index if not exists idx_campaigns_team_id on campaigns(team_id);

-- 🔧 Utility: who can administer a team?
create or replace function public.is_team_admin(p_team uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from team_members tm
    where tm.team_id = p_team
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  );
$$;

-- 🔧 Utility: is a team member?
create or replace function public.is_team_member(p_team uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from team_members tm
    where tm.team_id = p_team and tm.user_id = auth.uid()
  );
$$;

-- 🔧 Seats compute view (for admin dashboards or cron to reconcile)
create or replace view team_seats as
select
  t.id as team_id,
  count(tm.user_id)::int as seats
from teams t
left join team_members tm on tm.team_id = t.id
group by t.id;

-- RLS: teams visible to members
drop policy if exists team_owner_can_view on teams;
create policy "teams_select_members"
on teams for select
using (public.is_team_member(id));

-- Allow owners/admins to update their team metadata (e.g., stripe ids)
create policy "teams_update_admins"
on teams for update
using (public.is_team_admin(id));

-- RLS on team_members (read own team roster)
drop policy if exists members_can_view on team_members;
create policy "team_members_select_members"
on team_members for select
using (public.is_team_member(team_id));

-- Only admins can add members
create policy "team_members_insert_admins"
on team_members for insert
with check (public.is_team_admin(team_id));

-- Only admins can update roles
create policy "team_members_update_admins"
on team_members for update
using (public.is_team_admin(team_id))
with check (public.is_team_admin(team_id));

-- Only admins can remove members
create policy "team_members_delete_admins"
on team_members for delete
using (public.is_team_admin(team_id));

-- 🔐 Campaign access: any member of the campaign's team
alter table campaigns enable row level security;
drop policy if exists campaign_team_access on campaigns;
create policy "campaigns_crud_members"
on campaigns for all
using (public.is_team_member(team_id))
with check (public.is_team_member(team_id));

-- (Optional now, but recommended) Apply same pattern to replies/sent_emails tables
-- alter table replies enable row level security;
-- create policy "replies_team" on replies for select using (public.is_team_member(team_id));

-- 🔄 Trigger: keep teams.seat_count in sync (cached)
create or replace function public.update_team_seat_cache()
returns trigger language plpgsql as $$
begin
  update teams t
    set seat_count = (select count(*) from team_members tm where tm.team_id = t.id),
        updated_at = now()
  where t.id = coalesce(NEW.team_id, OLD.team_id);
  return null;
end; $$;

drop trigger if exists trg_team_members_seat_cache on team_members;
create trigger trg_team_members_seat_cache
after insert or update or delete on team_members
for each row execute function public.update_team_seat_cache();

