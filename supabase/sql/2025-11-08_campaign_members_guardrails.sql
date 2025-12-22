-- Auto-owner mirror, single owner guard, invite claim helper, and enriched members view

-- A) Auto-mirror the creator as owner on new campaigns
create or replace function public.fn_campaign_owner_mirror()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role)
  values (new.id, auth.uid(), 'owner')
  on conflict (campaign_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_campaign_owner_mirror on public.campaigns;
create trigger trg_campaign_owner_mirror
after insert on public.campaigns
for each row execute procedure public.fn_campaign_owner_mirror();


-- B) Guardrail: allow many editors/viewers but only ONE owner per campaign
create or replace function public.fn_enforce_single_owner()
returns trigger
language plpgsql
as $$
declare
  owner_count int;
begin
  if (new.role = 'owner') then
    select count(*) into owner_count
    from public.campaign_members
    where campaign_id = coalesce(new.campaign_id, old.campaign_id)
      and role = 'owner'
      and (id <> coalesce(new.id, old.id));

    if owner_count >= 1 then
      raise exception 'Campaign already has an owner';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_single_owner_ins on public.campaign_members;
create trigger trg_enforce_single_owner_ins
before insert on public.campaign_members
for each row execute procedure public.fn_enforce_single_owner();

drop trigger if exists trg_enforce_single_owner_upd on public.campaign_members;
create trigger trg_enforce_single_owner_upd
before update of role on public.campaign_members
for each row execute procedure public.fn_enforce_single_owner();


-- C) profile_emails RLS so we can safely show emails for members in the same campaign
alter table public.profile_emails enable row level security;

drop policy if exists "profile_emails_by_same_campaign" on public.profile_emails;
create policy "profile_emails_by_same_campaign" on public.profile_emails
for select using (
  exists (
    select 1
    from public.campaign_members cm_me
    join public.campaign_members cm_them
      on cm_them.campaign_id = cm_me.campaign_id
    where cm_me.user_id = auth.uid()
      and cm_them.user_id = profile_emails.user_id
  )
);


-- D) Pending invite sentinel + resolver
create or replace function public.claim_pending_invites(p_user uuid, p_email text)
returns int
language sql
security definer
set search_path = public
as $$
  with matched as (
    select cm.id
    from public.campaign_members cm
    join public.profile_emails pe
      on pe.email = lower(p_email)
    where cm.user_id = '00000000-0000-0000-0000-000000000000'::uuid
      and pe.user_id = p_user
  ), upd as (
    update public.campaign_members cm
    set user_id = p_user
    where cm.id in (select id from matched)
    returning 1
  )
  select count(*) from upd;
$$;


-- E) RLS-safe enriched campaign members view
create or replace view public.v_campaign_members_enriched as
select
  cm.id,
  cm.campaign_id,
  cm.user_id,
  pe.email,
  cm.role,
  cm.created_at
from public.campaign_members cm
left join public.profile_emails pe on pe.user_id = cm.user_id;



