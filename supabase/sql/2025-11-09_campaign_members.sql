-- Campaign membership + invites + RLS refresh (idempotent)

-- A) Members table ---------------------------------------------------------
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  unique (campaign_id, user_id)
);

create index if not exists idx_cmembers_campaign on public.campaign_members(campaign_id);
create index if not exists idx_cmembers_user on public.campaign_members(user_id);


-- B) Helper role checks -----------------------------------------------------
create or replace function public.is_campaign_viewer(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_campaign_editor(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.user_id = auth.uid()
      and m.role in ('owner','editor')
  );
$$;

create or replace function public.is_campaign_owner(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;


-- C) Invite tokens ----------------------------------------------------------
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('editor','viewer')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  unique (campaign_id, email)
);

alter table public.campaign_invites
  add column if not exists expires_at timestamptz;

alter table public.campaign_invites
  add column if not exists accepted_at timestamptz;

alter table public.campaign_invites
  add column if not exists invited_by uuid;

alter table public.campaign_invites
  add column if not exists token text;

-- Ensure role constraint and uniqueness
alter table public.campaign_invites
  drop constraint if exists campaign_invites_role_check;
alter table public.campaign_invites
  add constraint campaign_invites_role_check check (role in ('editor','viewer'));

alter table public.campaign_invites
  drop constraint if exists campaign_invites_token_key;
alter table public.campaign_invites
  add constraint campaign_invites_token_key unique (token);

alter table public.campaign_invites
  drop constraint if exists campaign_invites_campaign_id_email_key;
alter table public.campaign_invites
  add constraint campaign_invites_campaign_id_email_key unique (campaign_id, email);

alter table public.campaign_invites
  drop constraint if exists campaign_invites_invited_by_fkey;
alter table public.campaign_invites
  add constraint campaign_invites_invited_by_fkey
    foreign key (invited_by) references auth.users(id) on delete cascade;

update public.campaign_invites ci
set invited_by = coalesce(
  invited_by,
  (select c.user_id from public.campaigns c where c.id = ci.campaign_id)
)
where invited_by is null;

alter table public.campaign_invites
  alter column invited_by set not null;

update public.campaign_invites
set token = encode(gen_random_bytes(24), 'hex')
where token is null;

alter table public.campaign_invites
  alter column token set not null;

update public.campaign_invites
set expires_at = now() + interval '72 hours'
where expires_at is null;

alter table public.campaign_invites
  alter column expires_at set not null;

create index if not exists idx_cinv_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_cinv_email on public.campaign_invites(email);


-- D) Accept invite helper ---------------------------------------------------
drop function if exists public.accept_campaign_invite(text);

create or replace function public.accept_campaign_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
begin
  select *
  into v_invite
  from public.campaign_invites
  where token = p_token
    and accepted_at is null
    and now() < expires_at
  limit 1;

  if not found then
    return false;
  end if;

  insert into public.campaign_members(campaign_id, user_id, role)
  values (v_invite.campaign_id, auth.uid(), v_invite.role)
  on conflict (campaign_id, user_id) do nothing;

  update public.campaign_invites
     set accepted_at = now()
   where id = v_invite.id;

  return true;
end
$$;

revoke all on function public.accept_campaign_invite(text) from public;
grant execute on function public.accept_campaign_invite(text) to authenticated;


-- E) RLS for campaign_members & invites -------------------------------------
alter table public.campaign_members enable row level security;
drop policy if exists "campmem_select" on public.campaign_members;
drop policy if exists "campmem_insert" on public.campaign_members;
drop policy if exists "campmem_update" on public.campaign_members;
drop policy if exists "campmem_delete" on public.campaign_members;
drop policy if exists "cmembers_select_self" on public.campaign_members;
drop policy if exists "cmembers_write_owner" on public.campaign_members;

create policy "cmembers_select_self" on public.campaign_members
  for select to authenticated
  using (
    exists (
      select 1
      from public.campaign_members mm
      where mm.campaign_id = campaign_members.campaign_id
        and mm.user_id = auth.uid()
    )
  );

create policy "cmembers_write_owner" on public.campaign_members
  for all to authenticated
  using (public.is_campaign_owner(campaign_id))
  with check (public.is_campaign_owner(campaign_id));

alter table public.campaign_invites enable row level security;
drop policy if exists "inv_select" on public.campaign_invites;
drop policy if exists "inv_write" on public.campaign_invites;
drop policy if exists "inv_delete" on public.campaign_invites;
drop policy if exists "cinv_select_owner" on public.campaign_invites;
drop policy if exists "cinv_write_owner" on public.campaign_invites;

create policy "cinv_select_owner" on public.campaign_invites
  for select to authenticated
  using (public.is_campaign_owner(campaign_id));

create policy "cinv_write_owner" on public.campaign_invites
  for all to authenticated
  using (public.is_campaign_owner(campaign_id))
  with check (public.is_campaign_owner(campaign_id));


-- F) Attach RLS to core tables ----------------------------------------------
alter table public.campaigns enable row level security;
drop policy if exists "campaigns_select" on public.campaigns;
drop policy if exists "campaigns_insert" on public.campaigns;
drop policy if exists "campaigns_update" on public.campaigns;
drop policy if exists "campaigns_delete" on public.campaigns;
drop policy if exists "campaigns_read_members" on public.campaigns;
drop policy if exists "campaigns_write_owner" on public.campaigns;

create policy "campaigns_read_members" on public.campaigns
  for select to authenticated using (public.is_campaign_viewer(id));

create policy "campaigns_write_owner" on public.campaigns
  for update to authenticated using (public.is_campaign_owner(id));

alter table public.followup_rules enable row level security;
drop policy if exists "fr_read_members" on public.followup_rules;
drop policy if exists "fr_write_editors" on public.followup_rules;

create policy "fr_read_members" on public.followup_rules
  for select to authenticated using (public.is_campaign_viewer(campaign_id));

create policy "fr_write_editors" on public.followup_rules
  for all to authenticated
  using (public.is_campaign_editor(campaign_id))
  with check (public.is_campaign_editor(campaign_id));

alter table public.reply_drafts enable row level security;
drop policy if exists "drafts_rw" on public.reply_drafts;
drop policy if exists "rd_read_members" on public.reply_drafts;
drop policy if exists "rd_write_editors" on public.reply_drafts;

create policy "rd_read_members" on public.reply_drafts
  for select to authenticated using (public.is_campaign_viewer(campaign_id));

create policy "rd_write_editors" on public.reply_drafts
  for update to authenticated
  using (public.is_campaign_editor(campaign_id));

alter table public.send_queue enable row level security;
drop policy if exists "squeue_rw" on public.send_queue;
drop policy if exists "sq_read_members" on public.send_queue;

create policy "sq_read_members" on public.send_queue
  for select to authenticated using (public.is_campaign_viewer(campaign_id));

alter table public.inbox_threads enable row level security;
drop policy if exists "threads_select" on public.inbox_threads;
drop policy if exists "threads_update" on public.inbox_threads;
drop policy if exists "it_read_members" on public.inbox_threads;
drop policy if exists "it_update_editors" on public.inbox_threads;

create policy "it_read_members" on public.inbox_threads
  for select to authenticated using (public.is_campaign_viewer(campaign_id));

create policy "it_update_editors" on public.inbox_threads
  for update to authenticated using (public.is_campaign_editor(campaign_id));

alter table public.followup_tasks enable row level security;
drop policy if exists "fut_read_members" on public.followup_tasks;

create policy "fut_read_members" on public.followup_tasks
  for select to authenticated using (public.is_campaign_viewer(campaign_id));


