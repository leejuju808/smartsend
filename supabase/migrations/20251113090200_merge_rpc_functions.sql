-- RPC Functions for Merging Tags and Notes

-- Merge lead tags
create or replace function public.merge_lead_tags(
  primary_id uuid,
  secondary_id uuid
) returns void
language plpgsql
security definer
as $$
declare
  v_account uuid := current_setting('app.account_id', true)::uuid;
  v_primary_tags text[];
  v_secondary_tags text[];
  v_merged_tags text[];
begin
  if v_account is null then
    raise exception 'app.account_id not set';
  end if;

  -- Get tags from both leads
  select coalesce(tags, '{}'::text[]) into v_primary_tags
  from public.leads
  where id = primary_id and account_id = v_account;

  select coalesce(tags, '{}'::text[]) into v_secondary_tags
  from public.leads
  where id = secondary_id and account_id = v_account;

  -- Merge tags (union, remove duplicates)
  v_merged_tags := array(
    select distinct unnest(v_primary_tags || v_secondary_tags)
    where unnest is not null and unnest != ''
  );

  -- Update primary lead with merged tags
  update public.leads
  set tags = v_merged_tags
  where id = primary_id and account_id = v_account;
end;
$$;

grant execute on function public.merge_lead_tags(uuid, uuid) to authenticated;

-- Merge lead notes
create or replace function public.merge_lead_notes(
  primary_id uuid,
  secondary_id uuid
) returns void
language plpgsql
security definer
as $$
declare
  v_account uuid := current_setting('app.account_id', true)::uuid;
begin
  if v_account is null then
    raise exception 'app.account_id not set';
  end if;

  -- Move notes from secondary to primary
  -- If lead_notes table exists, update lead_id
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'lead_notes'
  ) then
    update public.lead_notes
    set lead_id = primary_id
    where lead_id = secondary_id;
  end if;

  -- Also handle notes column if it exists on leads table
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'leads' 
    and column_name = 'notes'
  ) then
    update public.leads p
    set notes = concat(
      coalesce(p.notes, ''),
      case when p.notes is not null and p.notes != '' then E'\n\n--- Merged from duplicate ---\n\n' else '' end,
      coalesce(s.notes, '')
    )
    from public.leads s
    where p.id = primary_id 
      and s.id = secondary_id
      and p.account_id = v_account
      and s.account_id = v_account
      and s.notes is not null
      and s.notes != '';
  end if;
end;
$$;

grant execute on function public.merge_lead_notes(uuid, uuid) to authenticated;

-- Helper function to append to JSONB array
create or replace function public.jsonb_append(
  json jsonb,
  value jsonb
) returns jsonb
language sql
immutable
as $$
  select json || jsonb_build_array(value);
$$;

grant execute on function public.jsonb_append(jsonb, jsonb) to authenticated;












