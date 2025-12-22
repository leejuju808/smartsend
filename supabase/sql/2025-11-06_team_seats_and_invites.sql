-- Team collaboration + seat enforcement (idempotent)

-- A) Ensure billing accounts have seat counts ---------------------------------
alter table public.billing_accounts
  add column if not exists seats int not null default 1;

-- B) Campaign members enhancements -------------------------------------------
alter table public.campaign_members
  add column if not exists added_by uuid references auth.users(id) on delete set null,
  add column if not exists active boolean not null default true,
  add column if not exists removed_at timestamptz;

create index if not exists idx_camp_members_active
  on public.campaign_members(campaign_id, active)
  where active;

update public.campaign_members
set active = true
where active is null;

-- C) Team invites table -------------------------------------------------------
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('editor','viewer')),
  token text not null,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  canceled boolean not null default false,
  unique(owner_user_id, email)
);

create index if not exists idx_team_invites_owner_email
  on public.team_invites(owner_user_id, email);

-- D) Seat counts helper view --------------------------------------------------
create or replace view public.v_team_seat_counts as
select
  ba.user_id as owner_user_id,
  count(distinct cm.user_id)
    filter (where cm.role in ('editor','viewer') and cm.active)
    as active_seats,
  ba.seats
from public.billing_accounts ba
left join public.campaigns c on c.user_id = ba.user_id
left join public.campaign_members cm
  on cm.campaign_id = c.id
group by ba.user_id, ba.seats;

-- E) Seat guard helper --------------------------------------------------------
create or replace function public.can_add_member(p_owner uuid)
returns boolean
language sql
stable
as $$
  with x as (
    select
      coalesce(max(seats), 1) as seats,
      coalesce(max(active_seats), 0) as active_seats
    from public.v_team_seat_counts
    where owner_user_id = p_owner
  )
  select (select active_seats from x) < (select seats from x);
$$;

-- F) Trigger to enforce seats on campaign member activation -------------------
create or replace function public._trg_seat_guard()
returns trigger
language plpgsql
as $fn$
declare
  v_owner uuid;
  v_was_active boolean := false;
begin
  select user_id into v_owner from public.campaigns where id = new.campaign_id;
  if v_owner is null then
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    v_was_active := coalesce(old.active, false);
  end if;

  if new.role in ('editor','viewer') and coalesce(new.active, true) then
    if TG_OP <> 'UPDATE' or not v_was_active then
      if not public.can_add_member(v_owner) then
        raise exception 'Seat limit reached. Upgrade seats to add more teammates.';
      end if;
    end if;
  end if;

  return new;
end
$fn$;

drop trigger if exists trg_seat_guard on public.campaign_members;
create trigger trg_seat_guard
  before insert or update on public.campaign_members
  for each row
  execute function public._trg_seat_guard();

-- G) Team members view --------------------------------------------------------
create or replace view public.v_team_members as
select distinct on (u.id, cm.campaign_id)
  ba.user_id as owner_user_id,
  u.id as user_id,
  u.email as user_email,
  cm.campaign_id,
  cm.role,
  cm.active,
  cm.created_at,
  cm.removed_at
from public.billing_accounts ba
join public.campaigns c on c.user_id = ba.user_id
join public.campaign_members cm on cm.campaign_id = c.id
join auth.users u on u.id = cm.user_id
order by u.id, cm.campaign_id, cm.created_at desc;

-- H) Membership helper --------------------------------------------------------
create or replace function public.is_campaign_member(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign
      and cm.user_id = auth.uid()
      and cm.active
  );
$$;

-- I) RLS policies for inbox/log tables ---------------------------------------
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.send_logs enable row level security;
alter table public.send_queue enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.campaign_step_variants enable row level security;
alter table public.leads enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inbox_threads'
      and policyname = 'threads_by_membership'
  ) then
    create policy threads_by_membership on public.inbox_threads
      for select using (public.is_campaign_member(campaign_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inbox_messages'
      and policyname = 'messages_by_membership'
  ) then
    create policy messages_by_membership on public.inbox_messages
      for select using (public.is_campaign_member(campaign_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'send_logs'
      and policyname = 'send_logs_by_membership'
  ) then
    create policy send_logs_by_membership on public.send_logs
      for select using (public.is_campaign_member(campaign_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'send_queue'
      and policyname = 'send_queue_by_membership'
  ) then
    create policy send_queue_by_membership on public.send_queue
      for select using (public.is_campaign_member(campaign_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_steps'
      and policyname = 'steps_by_membership'
  ) then
    create policy steps_by_membership on public.campaign_steps
      for select using (
        exists (
          select 1 from public.campaigns c
          where c.id = campaign_steps.campaign_id
            and public.is_campaign_member(c.id)
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_step_variants'
      and policyname = 'step_variants_by_membership'
  ) then
    create policy step_variants_by_membership on public.campaign_step_variants
      for select using (
        exists (
          select 1 from public.campaign_steps cs
          join public.campaigns c on c.id = cs.campaign_id
          where cs.id = campaign_step_variants.campaign_step_id
            and public.is_campaign_member(c.id)
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'leads'
      and policyname = 'leads_by_membership'
  ) then
    create policy leads_by_membership on public.leads
      for select using (
        exists (
          select 1
          from public.campaigns c
          where c.id = leads.campaign_id
            and public.is_campaign_member(c.id)
        )
      );
  end if;
end $$;

