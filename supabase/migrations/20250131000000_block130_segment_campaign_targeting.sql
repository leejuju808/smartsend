-- Block 130 — Segment → Campaign Targeting
-- This migration connects segments to campaigns, enabling campaigns to target only leads in a chosen segment

-- 1) Ensure segment_id exists on campaigns with proper foreign key
do $$
begin
  -- Add segment_id column if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'segment_id'
  ) then
    alter table public.campaigns
    add column segment_id uuid
    references public.segments(id) on delete set null;
  end if;
end $$;

-- 2) Create helpful index for account + segment lookups
create index if not exists idx_campaigns_account_segment
on public.campaigns (account_id, segment_id)
where segment_id is not null;

-- 3) Add function to validate segment exists and belongs to account
create or replace function public.validate_campaign_segment(
  p_campaign_id uuid,
  p_segment_id uuid,
  p_account_id uuid
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_segment_account uuid;
begin
  -- If no segment_id, validation passes (campaign targets all leads)
  if p_segment_id is null then
    return true;
  end if;

  -- Check if segment exists and belongs to the account
  select account_id into v_segment_account
  from public.segments
  where id = p_segment_id
    and account_id = p_account_id
    and is_active = true;

  if v_segment_account is null then
    return false;
  end if;

  return true;
end $$;

-- 4) Add trigger to validate segment on campaign insert/update
create or replace function public.trg_validate_campaign_segment()
returns trigger
language plpgsql
as $$
begin
  -- Only validate if segment_id is set
  if new.segment_id is not null then
    if not public.validate_campaign_segment(
      new.id,
      new.segment_id,
      new.account_id
    ) then
      raise exception 'Segment does not exist or does not belong to this account';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists validate_campaign_segment on public.campaigns;
create trigger validate_campaign_segment
before insert or update on public.campaigns
for each row
execute function public.trg_validate_campaign_segment();

-- 5) Function to get segment lead count for preview
create or replace function public.get_segment_lead_count(
  p_segment_id uuid,
  p_account_id uuid
)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
  v_rule jsonb;
begin
  -- If segment_id is null, return count of all leads for account
  if p_segment_id is null then
    select count(*) into v_count
    from public.leads
    where account_id = p_account_id;
    return v_count;
  end if;

  -- Get segment rule
  select rule into v_rule
  from public.segments
  where id = p_segment_id
    and account_id = p_account_id
    and is_active = true;

  if v_rule is null then
    return 0;
  end if;

  -- Use materialized members if available (faster)
  select count(*) into v_count
  from public.lead_segment_members
  where segment_id = p_segment_id;

  -- If no materialized members, compute on-the-fly (slower but accurate)
  if v_count = 0 then
    -- This is a simplified version - in production you'd use the full recompute_segment logic
    -- For now, return 0 and let the app compute it
    return 0;
  end if;

  return v_count;
end $$;

-- 6) Add comment for documentation
comment on column public.campaigns.segment_id is 
  'Target segment for this campaign. If null, campaign targets all leads. If segment is deleted, this is set to null.';












