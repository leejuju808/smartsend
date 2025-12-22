-- Membership table
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer','editor','owner')),
  unique (campaign_id, user_id)
);

create index if not exists idx_campaign_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_campaign_members_user on public.campaign_members(user_id);

-- Invite table
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer','editor','owner')),
  token text not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique (token)
);

create index if not exists idx_campaign_invites_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_campaign_invites_email on public.campaign_invites(email);

-- Fast access helper
create or replace function public.is_campaign_member(
  p_campaign uuid,
  p_user uuid,
  p_roles text[] default array['viewer','editor','owner']
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.user_id = p_user
      and m.role = any(p_roles)
  );
$$;

-- Enable RLS
alter table public.campaigns enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.campaign_leads enable row level security;
alter table public.followup_tasks enable row level security;
alter table public.delivery_events enable row level security;

-- Campaign policies
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
for select using (public.is_campaign_member(id, auth.uid(), array['viewer','editor','owner']));

drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns
for update using (public.is_campaign_member(id, auth.uid(), array['editor','owner']));

-- Campaign steps policies
drop policy if exists steps_select on public.campaign_steps;
create policy steps_select on public.campaign_steps
for select using (public.is_campaign_member(campaign_id, auth.uid()));

drop policy if exists steps_modify on public.campaign_steps;
create policy steps_modify on public.campaign_steps
for all using (public.is_campaign_member(campaign_id, auth.uid(), array['editor','owner']));

-- Campaign leads policies
drop policy if exists leads_select on public.campaign_leads;
create policy leads_select on public.campaign_leads
for select using (public.is_campaign_member(campaign_id, auth.uid()));

drop policy if exists leads_modify on public.campaign_leads;
create policy leads_modify on public.campaign_leads
for all using (public.is_campaign_member(campaign_id, auth.uid(), array['editor','owner']));

-- Followup tasks & delivery events policies
drop policy if exists followups_rw on public.followup_tasks;
create policy followups_rw on public.followup_tasks
for all using (public.is_campaign_member(campaign_id, auth.uid(), array['editor','owner']));

drop policy if exists events_select on public.delivery_events;
create policy events_select on public.delivery_events
for select using (public.is_campaign_member(campaign_id, auth.uid()));

-- Library sync helpers
create or replace function public.sync_library_perms_for_member(
  p_campaign uuid,
  p_user uuid,
  p_role text
) returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select id
    from public.shared_resources
    where scope = 'campaign'
      and campaign_id = p_campaign
  loop
    insert into public.shared_resource_permissions(resource_id, user_id, role)
    values (r.id, p_user, case when p_role in ('owner','editor') then p_role else 'viewer' end)
    on conflict (resource_id, user_id) do update
      set role = excluded.role;
  end loop;
end;
$$;

create or replace function public.remove_library_perms_for_member(
  p_campaign uuid,
  p_user uuid
) returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select id
    from public.shared_resources
    where scope = 'campaign'
      and campaign_id = p_campaign
  loop
    delete from public.shared_resource_permissions
    where resource_id = r.id
      and user_id = p_user;
  end loop;
end;
$$;

-- Membership triggers
create or replace function public.on_campaign_members_change()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.sync_library_perms_for_member(new.campaign_id, new.user_id, new.role);
    return new;
  elsif (tg_op = 'UPDATE') then
    perform public.sync_library_perms_for_member(new.campaign_id, new.user_id, new.role);
    return new;
  elsif (tg_op = 'DELETE') then
    perform public.remove_library_perms_for_member(old.campaign_id, old.user_id);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_campaign_members_change on public.campaign_members;
create trigger trg_campaign_members_change
after insert or update or delete on public.campaign_members
for each row execute procedure public.on_campaign_members_change();

-- Shared resource sync trigger
create or replace function public.on_shared_resource_insert_sync_members()
returns trigger
language plpgsql
as $$
begin
  if (new.scope = 'campaign' and new.campaign_id is not null) then
    insert into public.shared_resource_permissions(resource_id, user_id, role)
    select new.id,
           m.user_id,
           case when m.role in ('owner','editor') then m.role else 'viewer' end
    from public.campaign_members m
    where m.campaign_id = new.campaign_id
    on conflict (resource_id, user_id) do update
      set role = excluded.role;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_shared_resource_insert_sync on public.shared_resources;
create trigger trg_shared_resource_insert_sync
after insert on public.shared_resources
for each row execute procedure public.on_shared_resource_insert_sync_members();





