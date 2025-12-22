-- A) Allow email-less single-use links
-- Extend existing invite_tokens table
alter table public.invite_tokens
  add column if not exists is_link boolean not null default false;

-- Make email nullable if it's currently not null
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'invite_tokens' 
    and column_name = 'email' 
    and is_nullable = 'NO'
  ) then
    alter table public.invite_tokens alter column email drop not null;
  end if;
end $$;

-- Ensure either email OR link (not both/neither)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'invite_email_or_link_check'
    and table_schema = 'public'
    and table_name = 'invite_tokens'
  ) then
    alter table public.invite_tokens
      add constraint invite_email_or_link_check
      check ((email is not null) <> (is_link = true));
  end if;
end $$;

-- Indexes
create index if not exists idx_invite_tokens_campaign on public.invite_tokens(campaign_id);
create index if not exists idx_invite_tokens_token on public.invite_tokens(token);
create index if not exists idx_invite_tokens_consumed on public.invite_tokens(consumed, expires_at);

-- B) Activity log
create table if not exists public.campaign_activity (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_id uuid null references auth.users(id) on delete set null,
  event text not null check (event in (
    'share_added','share_updated','share_removed',
    'invite_created','invite_accepted','invite_revoked',
    'link_created','link_revoked'
  )),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_campaign on public.campaign_activity(campaign_id);
alter table public.campaign_activity enable row level security;

-- Visible to members
create policy "activity.select.members"
on public.campaign_activity for select
using (public.can_view_campaign(campaign_id));

-- Writes only from server routes (no client direct)
revoke all on table public.campaign_activity from anon, authenticated;

-- C) Helper to log (security definer so routes can call once)
create or replace function public.log_activity(
  p_campaign uuid, p_actor uuid, p_event text, p_meta jsonb default '{}'::jsonb
) returns void
language sql
security definer
as $$
  insert into public.campaign_activity (campaign_id, actor_id, event, meta)
  values (p_campaign, p_actor, p_event, coalesce(p_meta, '{}'::jsonb));
$$;

revoke all on function public.log_activity(uuid,uuid,text,jsonb) from public;
grant execute on function public.log_activity(uuid,uuid,text,jsonb) to authenticated;

-- D) Update consume_invite function to log activity
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
    and expires_at > now()
  limit 1;
  
  if v is null then
    raise exception 'invalid_or_expired' using errcode = 'P0001';
  end if;

  -- Mark as consumed
  update public.invite_tokens
     set consumed = true, accepted_by = p_user, accepted_at = now()
   where id = v.id;

  -- Add to campaign_shares
  insert into public.campaign_shares (campaign_id, user_id, role)
  values (v.campaign_id, p_user, v.role)
  on conflict (campaign_id, user_id) do update set role = excluded.role;

  -- log acceptance (if log_activity function exists)
  begin
    perform public.log_activity(v.campaign_id, p_user, 'invite_accepted',
      jsonb_build_object('invite_id', v.id, 'is_link', coalesce(v.is_link, false), 'role', v.role));
  exception when others then
    -- Ignore if log_activity doesn't exist yet
    null;
  end;

  return query select v.campaign_id, v.role;
end;
$$;

revoke all on function public.consume_invite(text,uuid) from public;
grant execute on function public.consume_invite(text,uuid) to authenticated;

-- Enable RLS on invite_tokens
alter table public.invite_tokens enable row level security;

-- RLS policies for invite_tokens
-- Viewers/editors can see invites for campaigns they can view
create policy "invite_tokens.select.viewers"
on public.invite_tokens for select
using (public.can_view_campaign(campaign_id));

-- Only owners/editors can create invites
create policy "invite_tokens.insert.owners"
on public.invite_tokens for insert
with check (
  exists (
    select 1 from public.campaigns c 
    where c.id = campaign_id and c.user_id = auth.uid()
  ) or public.can_edit_campaign(campaign_id)
);

-- Only owners/editors can update/revoke invites
create policy "invite_tokens.update.owners"
on public.invite_tokens for update
using (
  exists (
    select 1 from public.campaigns c 
    where c.id = campaign_id and c.user_id = auth.uid()
  ) or public.can_edit_campaign(campaign_id)
);

