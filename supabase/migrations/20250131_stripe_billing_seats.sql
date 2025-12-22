-- Stripe Billing + Seats System
-- Extends existing billing_subscriptions table with seat management

-- Add seat management columns to existing billing_subscriptions table
alter table public.billing_subscriptions 
add column if not exists seats_allowed int default 1,
add column if not exists seats_in_use int default 0;

-- Update existing rows to have default seat values
update public.billing_subscriptions 
set seats_allowed = 1, seats_in_use = 0 
where seats_allowed is null or seats_in_use is null;

-- Function to refresh workspace seats count
create or replace function public.refresh_workspace_seats(_ws uuid)
returns void language sql as $$
  update public.billing_subscriptions b
  set seats_in_use = (
    select count(*) from public.workspace_members wm where wm.workspace_id = _ws
  ),
  updated_at = now()
  where b.workspace_id = _ws;
$$;

-- Trigger function to refresh seats when members change
create or replace function public.tg_refresh_seats() returns trigger
language plpgsql as $$
begin
  perform public.refresh_workspace_seats(coalesce(new.workspace_id, old.workspace_id));
  return null;
end; $$;

-- Drop existing trigger if it exists
drop trigger if exists trg_members_refresh_seats_ins on public.workspace_members;

-- Create trigger on workspace_members table
create trigger trg_members_refresh_seats_ins
after insert or delete or update on public.workspace_members
for each row execute function public.tg_refresh_seats();

-- Create view for feature gating
create or replace view public.v_workspace_plan as
select w.id as workspace_id,
       coalesce(b.plan,'solo') as plan,
       coalesce(b.status,'trialing') as status,
       coalesce(b.seats_in_use, (select count(*) from workspace_members m where m.workspace_id=w.id)) as seats_in_use,
       coalesce(b.seats_allowed, 1) as seats_allowed
from public.workspaces w
left join public.billing_subscriptions b on b.workspace_id=w.id;

-- Grant access to the view
grant select on public.v_workspace_plan to authenticated;

-- Update RLS policy for billing_subscriptions to allow members to read
drop policy if exists "members can view their workspace subscription" on public.billing_subscriptions;
create policy "billing read if member"
on public.billing_subscriptions for select
using (public.is_workspace_member(workspace_id));

-- Function to check if workspace can add more members
create or replace function public.can_add_member(_ws uuid)
returns boolean language sql as $$
  select case 
    when not exists(select 1 from public.billing_subscriptions where workspace_id = _ws) then true
    when (select seats_in_use from public.billing_subscriptions where workspace_id = _ws) < 
         (select seats_allowed from public.billing_subscriptions where workspace_id = _ws) then true
    else false
  end;
$$;

-- Function to get workspace billing status
create or replace function public.get_workspace_billing_status(_ws uuid)
returns table(
  plan text,
  status text,
  seats_in_use int,
  seats_allowed int,
  can_add_members boolean
) language sql as $$
  select 
    coalesce(b.plan, 'solo') as plan,
    coalesce(b.status, 'trialing') as status,
    coalesce(b.seats_in_use, (select count(*) from workspace_members m where m.workspace_id = _ws)) as seats_in_use,
    coalesce(b.seats_allowed, 1) as seats_allowed,
    public.can_add_member(_ws) as can_add_members
  from public.workspaces w
  left join public.billing_subscriptions b on b.workspace_id = w.id
  where w.id = _ws;
$$;