-- Block 85 — Saved View sharing (ACL + invites + RLS)

-- 1) Role enum ------------------------------------------------------------------
do $$
begin
  create type public.saved_view_role as enum ('viewer', 'editor', 'owner');
exception
  when duplicate_object then null;
end;
$$;


-- 2) Memberships (explicit ACL) --------------------------------------------------
create table if not exists public.saved_view_memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  view_id uuid not null references public.saved_views(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.saved_view_role not null default 'viewer',
  unique (view_id, user_id)
);

create index if not exists idx_saved_view_memberships_view_role
  on public.saved_view_memberships (view_id, role);

drop trigger if exists trg_saved_view_memberships_set_updated_at on public.saved_view_memberships;
create trigger trg_saved_view_memberships_set_updated_at
before update on public.saved_view_memberships
for each row execute function public.set_updated_at();


-- 3) Invite-by-email (pending) ---------------------------------------------------
create table if not exists public.saved_view_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  view_id uuid not null references public.saved_views(id) on delete cascade,
  email text not null,
  role public.saved_view_role not null default 'viewer',
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  unique (view_id, email)
);

update public.saved_view_invites
set email = lower(email)
where email <> lower(email);

alter table public.saved_view_invites
  add constraint saved_view_invites_email_lowercase check (email = lower(email));

create index if not exists idx_saved_view_invites_view
  on public.saved_view_invites (view_id);


-- 4) Convenience: ensure owner membership on create ------------------------------
create or replace function public.fn_saved_view_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is null or new.owner_id is null then
    return new;
  end if;

  insert into public.saved_view_memberships(account_id, view_id, user_id, role)
  values (new.account_id, new.id, new.owner_id, 'owner')
  on conflict (view_id, user_id) do update set role = excluded.role;

  return new;
end;
$$;

drop trigger if exists trg_saved_view_owner_membership on public.saved_views;
create trigger trg_saved_view_owner_membership
after insert on public.saved_views
for each row execute function public.fn_saved_view_owner_membership();

insert into public.saved_view_memberships (account_id, view_id, user_id, role)
select sv.account_id, sv.id, sv.owner_id, 'owner'
from public.saved_views sv
where sv.account_id is not null
  and sv.owner_id is not null
on conflict (view_id, user_id) do update set role = excluded.role;

-- 5) RLS for memberships & invites ----------------------------------------------
alter table public.saved_view_memberships enable row level security;

drop policy if exists svm_read on public.saved_view_memberships;
drop policy if exists svm_insert_self_owner on public.saved_view_memberships;
drop policy if exists svm_service_role on public.saved_view_memberships;
drop policy if exists svm_update on public.saved_view_memberships;
drop policy if exists svm_delete on public.saved_view_memberships;

create policy svm_read on public.saved_view_memberships
for select using (
  auth.role() = 'service_role'
  or public.is_account_member(auth.uid(), account_id)
  or user_id = auth.uid()
);

create policy svm_insert_self_owner on public.saved_view_memberships
for insert with check (
  (auth.role() = 'service_role')
  or (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1
      from public.saved_views sv
      where sv.id = saved_view_memberships.view_id
        and sv.owner_id = auth.uid()
    )
  )
);

create policy svm_service_role on public.saved_view_memberships
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy svm_update on public.saved_view_memberships
for update using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy svm_delete on public.saved_view_memberships
for delete using (auth.role() = 'service_role');


alter table public.saved_view_invites enable row level security;

drop policy if exists svi_read on public.saved_view_invites;
drop policy if exists svi_manage on public.saved_view_invites;

create policy svi_read on public.saved_view_invites
for select using (
  auth.role() = 'service_role'
  or public.is_account_member(auth.uid(), account_id)
);

create policy svi_manage on public.saved_view_invites
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');


-- 6) Saved view policies with ACL -----------------------------------------------
drop policy if exists sv_select on public.saved_views;
drop policy if exists sv_insert on public.saved_views;
drop policy if exists sv_update on public.saved_views;
drop policy if exists sv_delete on public.saved_views;
drop policy if exists sv_service_role on public.saved_views;

create policy sv_select on public.saved_views
for select using (
  (
    case
      when visibility = 'private' then owner_id = auth.uid()
      when visibility in ('team', 'system') then public.is_account_member(auth.uid(), account_id)
      else false
    end
  )
  or exists (
    select 1
    from public.saved_view_memberships m
    where m.view_id = saved_views.id
      and m.user_id = auth.uid()
  )
);

create policy sv_insert on public.saved_views
for insert with check (
  account_id is not null
  and public.is_account_member(auth.uid(), account_id)
  and owner_id = auth.uid()
  and (
    scope = 'account'
    or (
      scope = 'campaign'
      and exists (
        select 1
        from public.campaigns c
        where c.id = saved_views.campaign_id
          and c.account_id = saved_views.account_id
      )
    )
  )
);

create policy sv_update on public.saved_views
for update using (
  public.is_account_member(auth.uid(), account_id)
  and (
    (visibility <> 'system' and (owner_id = auth.uid() or public.account_role(account_id) in ('owner', 'admin')))
    or (visibility = 'system' and public.account_role(account_id) in ('owner', 'admin'))
    or exists (
      select 1
      from public.saved_view_memberships m
      where m.view_id = saved_views.id
        and m.user_id = auth.uid()
        and m.role in ('editor', 'owner')
    )
  )
)
with check (
  public.is_account_member(auth.uid(), account_id)
  and (
    (visibility <> 'system' and (owner_id = auth.uid() or public.account_role(account_id) in ('owner', 'admin')))
    or (visibility = 'system' and public.account_role(account_id) in ('owner', 'admin'))
    or exists (
      select 1
      from public.saved_view_memberships m
      where m.view_id = saved_views.id
        and m.user_id = auth.uid()
        and m.role in ('editor', 'owner')
    )
  )
);

create policy sv_delete on public.saved_views
for delete using (
  public.is_account_member(auth.uid(), account_id)
  and (
    (visibility <> 'system' and (owner_id = auth.uid() or public.account_role(account_id) in ('owner', 'admin')))
    or (visibility = 'system' and public.account_role(account_id) in ('owner', 'admin'))
  )
);

create policy sv_service_role on public.saved_views
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

