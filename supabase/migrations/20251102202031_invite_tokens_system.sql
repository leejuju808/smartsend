-- Invite Tokens System
-- Allows campaign owners to invite non-users via email tokens

-- =====================================================
-- 1) Invite tokens table
-- =====================================================
create table if not exists public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer','editor')),
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_by uuid null references auth.users(id) on delete set null,
  accepted_at timestamptz null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  consumed boolean not null default false
);

create index if not exists idx_invite_tokens_campaign on public.invite_tokens(campaign_id);
create index if not exists idx_invite_tokens_email on public.invite_tokens(lower(email));

-- =====================================================
-- 2) RLS on invite_tokens
-- =====================================================
alter table public.invite_tokens enable row level security;

-- Owner/editor of the campaign can see their invites
create policy "invites.select.owner_or_editor"
  on public.invite_tokens for select
  using (public.can_edit_campaign(campaign_id));

-- Create invites only if you can edit
create policy "invites.insert.owner_or_editor"
  on public.invite_tokens for insert
  with check (public.can_edit_campaign(campaign_id));

-- Update (consume) is done by server/route after auth; restrict general updates
create policy "invites.update.none" 
  on public.invite_tokens for update 
  using (false);

create policy "invites.delete.owner_or_editor"
  on public.invite_tokens for delete
  using (public.can_edit_campaign(campaign_id));

-- =====================================================
-- 3) Helper to consume invite safely
-- =====================================================
create or replace function public.consume_invite(p_token text, p_user uuid)
returns table(campaign_id uuid, role text)
language plpgsql
security definer
as $$
declare v record;
begin
  select * into v from public.invite_tokens
  where token = p_token
    and consumed = false
    and now() < expires_at
  limit 1;

  if v is null then
    raise exception 'invalid_or_expired';
  end if;

  update public.invite_tokens
     set consumed = true,
         accepted_by = p_user,
         accepted_at = now()
   where id = v.id;

  -- upsert share
  insert into public.campaign_shares (campaign_id, user_id, role)
  values (v.campaign_id, p_user, v.role)
  on conflict (campaign_id, user_id) do update set role = excluded.role;

  return query select v.campaign_id, v.role;
end;
$$;

revoke all on function public.consume_invite(text,uuid) from public;
grant execute on function public.consume_invite(text,uuid) to authenticated;

-- =====================================================
-- 4) Optional: daily expiry cleanup job
-- =====================================================
create or replace function public.expire_old_invites()
returns void 
language sql 
security definer 
as $$
  update public.invite_tokens
     set consumed = true
   where consumed = false
     and now() >= expires_at;
$$;

revoke all on function public.expire_old_invites() from public;
-- call from a scheduled task with service key

