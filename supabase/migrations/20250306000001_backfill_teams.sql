-- Backfill Teams for Existing Users
-- Creates a default team per existing user, adds them as owner, and sets team_id for their rows

-- 1) Create teams for users who don't have one yet
-- For each user, create a team named "<User First> Team" (or "<Email> Team" if no name)
do $$
declare
  u record;
  team_uuid uuid;
  user_first_name text;
  team_name text;
begin
  for u in 
    select id, email, raw_user_meta_data 
    from auth.users
    where id not in (
      select distinct user_id from public.team_members
    )
  loop
    -- Get user's first name from metadata or use email prefix
    user_first_name := coalesce(
      u.raw_user_meta_data->>'first_name',
      u.raw_user_meta_data->>'name',
      split_part(u.email, '@', 1)
    );
    team_name := user_first_name || ' Team';
    
    -- Create team with user as owner
    insert into public.teams (name, owner_id)
    values (team_name, u.id)
    returning id into team_uuid;
    
    -- Add user as owner member
    insert into public.team_members (team_id, user_id, role)
    values (team_uuid, u.id, 'owner')
    on conflict (team_id, user_id) do update set role = 'owner';
    
    -- Update campaigns
    update public.campaigns 
    set team_id = team_uuid, created_by = u.id
    where team_id is null and (user_id = u.id or created_by = u.id or created_by is null);
    
    -- Update leads
    update public.leads 
    set team_id = team_uuid, created_by = u.id
    where team_id is null and (user_id = u.id or created_by = u.id or created_by is null);
    
    -- Update send_queue
    update public.send_queue 
    set team_id = team_uuid
    where team_id is null 
    and exists (
      select 1 from public.campaigns c 
      where c.id = send_queue.campaign_id 
      and c.team_id = team_uuid
    );
    
    -- Update emails_sent
    update public.emails_sent 
    set team_id = team_uuid
    where team_id is null
    and exists (
      select 1 from public.campaigns c 
      where c.id = emails_sent.campaign_id 
      and c.team_id = team_uuid
    );
    
    -- Update gmail_accounts (optional)
    update public.gmail_accounts 
    set team_id = team_uuid
    where team_id is null and user_id = u.id;
    
  end loop;
end $$;

-- 2) For existing rows that might have user_id but no team_id, try to infer from user's primary team
update public.campaigns c
set team_id = (
  select tm.team_id 
  from public.team_members tm 
  where tm.user_id = c.created_by 
  and tm.role = 'owner'
  order by tm.created_at
  limit 1
)
where c.team_id is null and c.created_by is not null;

update public.leads l
set team_id = (
  select tm.team_id 
  from public.team_members tm 
  where tm.user_id = l.created_by 
  and tm.role = 'owner'
  order by tm.created_at
  limit 1
)
where l.team_id is null and l.created_by is not null;

-- 3) Sync send_queue and emails_sent from campaign team_id
update public.send_queue sq
set team_id = (
  select team_id from public.campaigns c where c.id = sq.campaign_id
)
where sq.team_id is null and sq.campaign_id is not null;

update public.emails_sent es
set team_id = (
  select team_id from public.campaigns c where c.id = es.campaign_id
)
where es.team_id is null and es.campaign_id is not null;

