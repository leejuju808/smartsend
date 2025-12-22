-- Campaign collaboration with account + campaign roles
-- Generated from requested SQL block (idempotent where feasible)

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'team_role'
  ) then
    create type public.team_role as enum ('owner','admin','editor','viewer');
  end if;
exception
  when duplicate_object then null;
end;
$$;


create table if not exists public.team_members (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.team_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key(account_id, user_id)
);


create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.team_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key(campaign_id, user_id)
);


create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  inviter_id uuid references auth.users(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  scope text not null check (scope in ('account','campaign')),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  role public.team_role not null default 'viewer',
  token text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);

create index if not exists idx_invites_email on public.invites(email);


create or replace function public.is_account_member(p_user uuid, p_account uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.team_members tm
    where tm.account_id = p_account and tm.user_id = p_user
  );
$$;


create or replace function public.is_campaign_member(p_user uuid, p_campaign uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.campaign_members cm
    where cm.campaign_id = p_campaign and cm.user_id = p_user
  ) or exists(
    select 1 from public.team_members tm
    join public.campaigns c on c.account_id = tm.account_id
    where c.id = p_campaign and tm.user_id = p_user
  );
$$;


create or replace function public.role_at_campaign(p_user uuid, p_campaign uuid)
returns public.team_role language sql stable as $$
  with x as (
    select cm.role from public.campaign_members cm
     where cm.campaign_id = p_campaign and cm.user_id = p_user
    union all
    select tm.role from public.team_members tm
     join public.campaigns c on c.account_id = tm.account_id
     where c.id = p_campaign and tm.user_id = p_user
    limit 1
  )
  select coalesce((select role from x), 'viewer'::public.team_role);
$$;


create or replace function public.accept_invite(p_token text, p_user uuid)
returns void language plpgsql security definer as $$
declare v public.invites%rowtype;
begin
  select * into v from public.invites where token = p_token and expires_at > now() and accepted_at is null;
  if not found then raise exception 'Invalid or expired invite'; end if;

  if v.scope = 'account' then
    insert into public.team_members(account_id, user_id, role)
    values (v.account_id, p_user, v.role)
    on conflict (account_id, user_id) do update set role = greatest(team_members.role, excluded.role);
  else
    insert into public.campaign_members(campaign_id, user_id, role)
    values (v.campaign_id, p_user, v.role)
    on conflict (campaign_id, user_id) do update set role = greatest(campaign_members.role, excluded.role);
  end if;

  update public.invites set accepted_at = now() where id = v.id;
end;
$$;


alter table public.team_members enable row level security;
drop policy if exists tm_read on public.team_members;
drop policy if exists tm_write on public.team_members;
create policy tm_read on public.team_members
for select using ( auth.uid() is not null and exists(
  select 1 from public.team_members self
  where self.account_id = team_members.account_id and self.user_id = auth.uid()
));
create policy tm_write on public.team_members
for all using (false)
with check (false);


alter table public.campaign_members enable row level security;
drop policy if exists cm_read on public.campaign_members;
drop policy if exists cm_write on public.campaign_members;
create policy cm_read on public.campaign_members
for select using ( public.is_campaign_member(auth.uid(), campaign_id) );
create policy cm_write on public.campaign_members
for insert with check (
  (select role from public.team_members where account_id =
     (select account_id from public.campaigns where id = campaign_members.campaign_id)
     and user_id = auth.uid()
  ) in ('owner','admin')
  or
  public.role_at_campaign(auth.uid(), campaign_members.campaign_id) in ('owner','admin')
)
, update using (public.role_at_campaign(auth.uid(), campaign_members.campaign_id) in ('owner','admin'))
, delete using (public.role_at_campaign(auth.uid(), campaign_members.campaign_id) in ('owner','admin'));


alter table public.campaigns enable row level security;
drop policy if exists c_select on public.campaigns;
drop policy if exists c_mutate on public.campaigns;
create policy c_select on public.campaigns
for select using ( public.is_account_member(auth.uid(), account_id) );
create policy c_mutate on public.campaigns
for all using ( public.role_at_campaign(auth.uid(), id) in ('owner','admin','editor') )
with check ( public.role_at_campaign(auth.uid(), id) in ('owner','admin','editor') );


alter table public.campaign_steps enable row level security;
drop policy if exists cs_rw on public.campaign_steps;
create policy cs_rw on public.campaign_steps
for all using ( public.is_campaign_member(auth.uid(), campaign_id) )
with check ( public.role_at_campaign(auth.uid(), campaign_id) in ('owner','admin','editor') );


alter table public.step_variants enable row level security;
drop policy if exists sv_rw on public.step_variants;
create policy sv_rw on public.step_variants
for all using ( public.is_campaign_member(auth.uid(), campaign_id) )
with check ( public.role_at_campaign(auth.uid(), campaign_id) in ('owner','admin','editor') );


alter table public.threads enable row level security;
drop policy if exists th_rw on public.threads;
create policy th_rw on public.threads
for all using ( public.is_campaign_member(auth.uid(), campaign_id) )
with check ( public.role_at_campaign(auth.uid(), campaign_id) in ('owner','admin','editor') );


alter table public.messages enable row level security;
drop policy if exists msg_rw on public.messages;
create policy msg_rw on public.messages
for all using (
  exists (select 1 from public.threads t where t.id = messages.thread_id and public.is_campaign_member(auth.uid(), t.campaign_id))
)
with check (
  exists (select 1 from public.threads t where t.id = messages.thread_id and public.role_at_campaign(auth.uid(), t.campaign_id) in ('owner','admin','editor'))
);


alter table public.reply_detections enable row level security;
drop policy if exists rd_ro on public.reply_detections;
create policy rd_ro on public.reply_detections
for select using (
  exists (select 1 from public.threads t where t.id = reply_detections.thread_id and public.is_campaign_member(auth.uid(), t.campaign_id))
);


alter table public.thread_drafts enable row level security;
drop policy if exists td_rw on public.thread_drafts;
create policy td_rw on public.thread_drafts
for all using (
  exists (select 1 from public.threads t where t.id = thread_drafts.thread_id and public.is_campaign_member(auth.uid(), t.campaign_id))
)
with check (
  exists (select 1 from public.threads t where t.id = thread_drafts.thread_id and public.role_at_campaign(auth.uid(), t.campaign_id) in ('owner','admin','editor'))
);


alter table public.labels enable row level security;
drop policy if exists lb_rw on public.labels;
create policy lb_rw on public.labels
for all using ( public.is_account_member(auth.uid(), account_id) )
with check ( (select role from public.team_members where account_id = labels.account_id and user_id = auth.uid()) in ('owner','admin','editor') );


alter table public.thread_labels enable row level security;
drop policy if exists tl_rw on public.thread_labels;
create policy tl_rw on public.thread_labels
for all using (
  exists (select 1 from public.threads t where t.id = thread_labels.thread_id and public.is_campaign_member(auth.uid(), t.campaign_id))
)
with check (
  exists (select 1 from public.threads t where t.id = thread_labels.thread_id and public.role_at_campaign(auth.uid(), t.campaign_id) in ('owner','admin','editor'))
);


alter table public.audit_logs enable row level security;
drop policy if exists al_ro on public.audit_logs;
create policy al_ro on public.audit_logs
for select using (
  entity_type = 'thread' and exists (select 1 from public.threads t where t.id = audit_logs.entity_id and public.is_campaign_member(auth.uid(), t.campaign_id))
  or
  entity_type = 'lead' and exists (
    select 1 from public.leads l join public.campaigns c on c.id = l.campaign_id
    where l.id = audit_logs.entity_id and public.is_campaign_member(auth.uid(), c.id)
  )
);




