-- =========================================================
-- Block 12900 — SmartSend List Builder Tools v1
-- (The Contractor-Proof System for Creating, Splitting & Organizing Homeowner Lists Fast)
-- =========================================================

-- ============================================
-- 1) Enhance contact_lists table
-- ============================================

-- Add tags column (array of tags)
alter table public.contact_lists
  add column if not exists tags text[] default '{}';

-- Add visibility column (everyone vs owner/manager only)
alter table public.contact_lists
  add column if not exists visibility text check (
    visibility in ('everyone', 'owner_manager')
  ) default 'everyone';

-- Add updated_at column
alter table public.contact_lists
  add column if not exists updated_at timestamptz default now();

-- Create index for tags
create index if not exists idx_contact_lists_tags on public.contact_lists using gin(tags);

-- Create updated_at trigger function
create or replace function public.set_contact_lists_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Create trigger
drop trigger if exists trg_set_contact_lists_updated_at on public.contact_lists;
create trigger trg_set_contact_lists_updated_at
  before update on public.contact_lists
  for each row
  execute function public.set_contact_lists_updated_at();

-- ============================================
-- 2) Create list_insights view for analytics
-- ============================================

create or replace view public.list_insights as
select 
  cl.id as list_id,
  cl.workspace_id,
  cl.name as list_name,
  count(distinct clm.contact_id) as total_contacts,
  count(distinct case when c.tags && array['HOT'] then c.id end) as hot_count,
  count(distinct case when c.tags && array['WARM'] then c.id end) as warm_count,
  count(distinct case when c.tags && array['NOT INTERESTED'] then c.id end) as not_interested_count,
  count(distinct case when c.tags && array['NEW'] then c.id end) as new_count,
  -- Calculate reply rate (contacts with replies / total contacts)
  -- Note: This assumes you have a way to track replies (e.g., campaign_send_events or similar)
  count(distinct case when exists (
    select 1 from public.campaign_send_events cse 
    where cse.contact_id = c.id 
    and cse.event_type = 'reply'
  ) then c.id end) as contacts_with_replies,
  -- Count emails sent to this list
  count(distinct cse.id) as emails_sent,
  -- Get unique tags in list
  array_agg(distinct unnest(c.tags)) filter (where c.tags is not null) as tags_in_list
from public.contact_lists cl
left join public.contact_list_members clm on clm.list_id = cl.id
left join public.contacts c on c.id = clm.contact_id
left join public.campaign_send_events cse on cse.contact_id = c.id
group by cl.id, cl.workspace_id, cl.name;

-- Grant access to authenticated users
grant select on public.list_insights to authenticated;

-- ============================================
-- 3) Create function to split list by size
-- ============================================

create or replace function public.split_list_by_size(
  p_list_id uuid,
  p_chunk_size int,
  p_workspace_id uuid
)
returns table (
  new_list_id uuid,
  new_list_name text,
  contact_count bigint
)
language plpgsql
security definer
as $$
declare
  v_list_name text;
  v_total_contacts bigint;
  v_chunk_num int := 1;
  v_contact_record record;
  v_new_list_id uuid;
  v_contact_counter int := 0;
begin
  -- Get list name
  select name into v_list_name
  from public.contact_lists
  where id = p_list_id and workspace_id = p_workspace_id;
  
  if v_list_name is null then
    raise exception 'List not found or access denied';
  end if;
  
  -- Get total contacts
  select count(*) into v_total_contacts
  from public.contact_list_members
  where list_id = p_list_id;
  
  -- Create new lists and distribute contacts
  for v_contact_record in 
    select contact_id 
    from public.contact_list_members
    where list_id = p_list_id
    order by created_at
  loop
    -- Create new list if needed
    if v_contact_counter = 0 then
      insert into public.contact_lists (workspace_id, name, description)
      values (
        p_workspace_id,
        v_list_name || ' - Part ' || v_chunk_num,
        'Split from ' || v_list_name
      )
      returning id into v_new_list_id;
      
      -- Return the new list info
      return query select v_new_list_id, v_list_name || ' - Part ' || v_chunk_num, 0::bigint;
    end if;
    
    -- Add contact to current chunk
    insert into public.contact_list_members (workspace_id, list_id, contact_id)
    values (p_workspace_id, v_new_list_id, v_contact_record.contact_id)
    on conflict do nothing;
    
    v_contact_counter := v_contact_counter + 1;
    
    -- Move to next chunk if needed
    if v_contact_counter >= p_chunk_size then
      -- Update count for current chunk
      update public.list_insights set total_contacts = v_contact_counter where list_id = v_new_list_id;
      
      v_chunk_num := v_chunk_num + 1;
      v_contact_counter := 0;
    end if;
  end loop;
  
  -- Update final chunk count
  if v_contact_counter > 0 then
    update public.list_insights set total_contacts = v_contact_counter where list_id = v_new_list_id;
  end if;
end;
$$;

-- ============================================
-- 4) Create function to split list by tag
-- ============================================

create or replace function public.split_list_by_tag(
  p_list_id uuid,
  p_tag text,
  p_workspace_id uuid
)
returns table (
  new_list_id uuid,
  new_list_name text,
  contact_count bigint
)
language plpgsql
security definer
as $$
declare
  v_list_name text;
  v_new_list_id uuid;
  v_tag_contacts bigint;
begin
  -- Get list name
  select name into v_list_name
  from public.contact_lists
  where id = p_list_id and workspace_id = p_workspace_id;
  
  if v_list_name is null then
    raise exception 'List not found or access denied';
  end if;
  
  -- Create new list for this tag
  insert into public.contact_lists (workspace_id, name, description, tags)
  values (
    p_workspace_id,
    v_list_name || ' - ' || p_tag,
    'Split from ' || v_list_name || ' by tag: ' || p_tag,
    array[p_tag]
  )
  returning id into v_new_list_id;
  
  -- Add contacts with this tag
  insert into public.contact_list_members (workspace_id, list_id, contact_id)
  select p_workspace_id, v_new_list_id, clm.contact_id
  from public.contact_list_members clm
  join public.contacts c on c.id = clm.contact_id
  where clm.list_id = p_list_id
    and c.tags && array[p_tag]
  on conflict do nothing;
  
  -- Get count
  select count(*) into v_tag_contacts
  from public.contact_list_members
  where list_id = v_new_list_id;
  
  return query select v_new_list_id, v_list_name || ' - ' || p_tag, v_tag_contacts;
end;
$$;

-- ============================================
-- 5) Create function to split list by status
-- ============================================

create or replace function public.split_list_by_status(
  p_list_id uuid,
  p_workspace_id uuid
)
returns table (
  new_list_id uuid,
  new_list_name text,
  status text,
  contact_count bigint
)
language plpgsql
security definer
as $$
declare
  v_list_name text;
  v_status text;
  v_new_list_id uuid;
  v_status_contacts bigint;
begin
  -- Get list name
  select name into v_list_name
  from public.contact_lists
  where id = p_list_id and workspace_id = p_workspace_id;
  
  if v_list_name is null then
    raise exception 'List not found or access denied';
  end if;
  
  -- Split by common status tags
  for v_status in select unnest(array['HOT', 'WARM', 'NOT INTERESTED', 'NEW']) as s
  loop
    -- Create new list for this status
    insert into public.contact_lists (workspace_id, name, description, tags)
    values (
      p_workspace_id,
      v_list_name || ' - ' || v_status,
      'Split from ' || v_list_name || ' by status: ' || v_status,
      array[v_status]
    )
    returning id into v_new_list_id;
    
    -- Add contacts with this status tag
    insert into public.contact_list_members (workspace_id, list_id, contact_id)
    select p_workspace_id, v_new_list_id, clm.contact_id
    from public.contact_list_members clm
    join public.contacts c on c.id = clm.contact_id
    where clm.list_id = p_list_id
      and c.tags && array[v_status]
    on conflict do nothing;
    
    -- Get count
    select count(*) into v_status_contacts
    from public.contact_list_members
    where list_id = v_new_list_id;
    
    -- Only return if contacts exist
    if v_status_contacts > 0 then
      return query select v_new_list_id, v_list_name || ' - ' || v_status, v_status, v_status_contacts;
    end if;
  end loop;
end;
$$;

-- ============================================
-- 6) Create function to clean list (remove duplicates, suppressed, bounces)
-- ============================================

create or replace function public.clean_list(
  p_list_id uuid,
  p_workspace_id uuid,
  p_remove_duplicates boolean default true,
  p_remove_suppressed boolean default true,
  p_remove_bounces boolean default true
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
  v_duplicates_removed int := 0;
  v_suppressed_removed int := 0;
  v_bounces_removed int := 0;
begin
  -- Remove duplicates (keep first occurrence)
  if p_remove_duplicates then
    with duplicates as (
      select contact_id, row_number() over (partition by contact_id order by created_at) as rn
      from public.contact_list_members
      where list_id = p_list_id
    )
    delete from public.contact_list_members
    where list_id = p_list_id
      and contact_id in (
        select contact_id from duplicates where rn > 1
      );
    
    get diagnostics v_duplicates_removed = row_count;
  end if;
  
  -- Remove suppressed contacts
  if p_remove_suppressed then
    delete from public.contact_list_members clm
    where clm.list_id = p_list_id
      and exists (
        select 1 from public.suppression_list sl
        where sl.email = (select email from public.contacts where id = clm.contact_id)
          and sl.user_id in (
            select user_id from public.workspace_members where workspace_id = p_workspace_id
          )
      );
    
    get diagnostics v_suppressed_removed = row_count;
  end if;
  
  -- Remove bounced contacts (assuming we track bounces in suppression_list with reason='bounced')
  if p_remove_bounces then
    delete from public.contact_list_members clm
    where clm.list_id = p_list_id
      and exists (
        select 1 from public.suppression_list sl
        where sl.email = (select email from public.contacts where id = clm.contact_id)
          and sl.reason = 'bounced'
          and sl.user_id in (
            select user_id from public.workspace_members where workspace_id = p_workspace_id
          )
      );
    
    get diagnostics v_bounces_removed = row_count;
  end if;
  
  -- Return summary
  v_result := jsonb_build_object(
    'duplicates_removed', v_duplicates_removed,
    'suppressed_removed', v_suppressed_removed,
    'bounces_removed', v_bounces_removed,
    'total_removed', v_duplicates_removed + v_suppressed_removed + v_bounces_removed
  );
  
  return v_result;
end;
$$;

-- ============================================
-- 7) Comments
-- ============================================

comment on column public.contact_lists.tags is 'Array of tags associated with this list';
comment on column public.contact_lists.visibility is 'Visibility level: everyone (all members) or owner_manager (only owner and managers)';
comment on column public.contact_lists.updated_at is 'Timestamp when list was last updated';
comment on view public.list_insights is 'Analytics view for list metrics (contacts, status counts, reply rates)';
comment on function public.split_list_by_size is 'Splits a list into multiple smaller lists of specified size';
comment on function public.split_list_by_tag is 'Splits a list by a specific tag, creating separate lists for each tag value';
comment on function public.split_list_by_status is 'Splits a list by status tags (HOT, WARM, NOT INTERESTED, NEW)';
comment on function public.clean_list is 'Removes duplicates, suppressed contacts, and bounces from a list';

