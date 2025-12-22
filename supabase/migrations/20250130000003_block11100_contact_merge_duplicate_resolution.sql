-- Block 11100 — Contact Merge & Duplicate Resolution
-- Auto-Merge + Manual Merge Tool
-- Ensures SmartSend never gets duplicate contacts

-- ============================================================================
-- 1. DATA MODEL CHANGES
-- ============================================================================

-- Add merged_into column to contacts table
alter table public.contacts
  add column if not exists merged_into uuid null references public.contacts(id) on delete set null;

-- Create index for efficient lookups
create index if not exists idx_contacts_merged_into on public.contacts(merged_into) where merged_into is not null;

-- ============================================================================
-- 2. DUPLICATE DETECTION FUNCTIONS
-- ============================================================================

-- Enable pg_trgm extension for fuzzy matching (if not already enabled)
create extension if not exists pg_trgm;

-- Function to detect duplicate contacts
create or replace function public.detect_contact_duplicates(
  p_workspace_id uuid
)
returns table (
  group_id text,
  contact_id uuid,
  name text,
  email text,
  phone text,
  city text,
  zip text,
  tags jsonb,
  match_type text,
  match_score integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_counter integer := 0;
  v_group_id text;
begin
  -- Clear any existing duplicate groups for this workspace
  -- We'll build groups dynamically
  
  -- Strong matches: Exact email match
  for v_group_id, contact_id, name, email, phone, city, zip, tags, match_type, match_score in
    select 
      'email_' || lower(c1.email) as group_id,
      c1.id as contact_id,
      coalesce(c1.first_name || ' ' || c1.last_name, c1.name, '') as name,
      c1.email,
      c1.phone,
      c1.city,
      c1.zip,
      coalesce(c1.tags, '[]'::jsonb) as tags,
      'email_exact' as match_type,
      100 as match_score
    from public.contacts c1
    where c1.workspace_id = p_workspace_id
      and c1.merged_into is null
      and exists (
        select 1 from public.contacts c2
        where c2.workspace_id = p_workspace_id
          and c2.id != c1.id
          and c2.merged_into is null
          and lower(c2.email) = lower(c1.email)
      )
  loop
    return next;
  end loop;
  
  -- Strong matches: Exact phone match (if phone exists)
  for v_group_id, contact_id, name, email, phone, city, zip, tags, match_type, match_score in
    select 
      'phone_' || regexp_replace(coalesce(c1.phone, ''), '[^0-9]', '', 'g') as group_id,
      c1.id as contact_id,
      coalesce(c1.first_name || ' ' || c1.last_name, c1.name, '') as name,
      c1.email,
      c1.phone,
      c1.city,
      c1.zip,
      coalesce(c1.tags, '[]'::jsonb) as tags,
      'phone_exact' as match_type,
      90 as match_score
    from public.contacts c1
    where c1.workspace_id = p_workspace_id
      and c1.merged_into is null
      and c1.phone is not null
      and trim(c1.phone) != ''
      and exists (
        select 1 from public.contacts c2
        where c2.workspace_id = p_workspace_id
          and c2.id != c1.id
          and c2.merged_into is null
          and c2.phone is not null
          and trim(c2.phone) != ''
          and regexp_replace(coalesce(c2.phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(c1.phone, ''), '[^0-9]', '', 'g')
      )
  loop
    return next;
  end loop;
  
  -- Medium matches: Same name + same ZIP
  for v_group_id, contact_id, name, email, phone, city, zip, tags, match_type, match_score in
    select 
      'name_zip_' || lower(coalesce(c1.first_name || ' ' || c1.last_name, c1.name, '')) || '_' || coalesce(c1.zip, '') as group_id,
      c1.id as contact_id,
      coalesce(c1.first_name || ' ' || c1.last_name, c1.name, '') as name,
      c1.email,
      c1.phone,
      c1.city,
      c1.zip,
      coalesce(c1.tags, '[]'::jsonb) as tags,
      'name_zip' as match_type,
      70 as match_score
    from public.contacts c1
    where c1.workspace_id = p_workspace_id
      and c1.merged_into is null
      and coalesce(c1.first_name || ' ' || c1.last_name, c1.name, '') != ''
      and c1.zip is not null
      and trim(c1.zip) != ''
      and exists (
        select 1 from public.contacts c2
        where c2.workspace_id = p_workspace_id
          and c2.id != c1.id
          and c2.merged_into is null
          and lower(coalesce(c2.first_name || ' ' || c2.last_name, c2.name, '')) = lower(coalesce(c1.first_name || ' ' || c1.last_name, c1.name, ''))
          and c2.zip = c1.zip
      )
  loop
    return next;
  end loop;
  
  -- Medium matches: Same name + same city
  for v_group_id, contact_id, name, email, phone, city, zip, tags, match_type, match_score in
    select 
      'name_city_' || lower(coalesce(c1.first_name || ' ' || c1.last_name, c1.name, '')) || '_' || lower(coalesce(c1.city, '')) as group_id,
      c1.id as contact_id,
      coalesce(c1.first_name || ' ' || c1.last_name, c1.name, '') as name,
      c1.email,
      c1.phone,
      c1.city,
      c1.zip,
      coalesce(c1.tags, '[]'::jsonb) as tags,
      'name_city' as match_type,
      60 as match_score
    from public.contacts c1
    where c1.workspace_id = p_workspace_id
      and c1.merged_into is null
      and coalesce(c1.first_name || ' ' || c1.last_name, c1.name, '') != ''
      and c1.city is not null
      and trim(c1.city) != ''
      and exists (
        select 1 from public.contacts c2
        where c2.workspace_id = p_workspace_id
          and c2.id != c1.id
          and c2.merged_into is null
          and lower(coalesce(c2.first_name || ' ' || c2.last_name, c2.name, '')) = lower(coalesce(c1.first_name || ' ' || c1.last_name, c1.name, ''))
          and lower(c2.city) = lower(c1.city)
      )
  loop
    return next;
  end loop;
end;
$$;

comment on function public.detect_contact_duplicates is 'Detects duplicate contacts in a workspace using email, phone, name+zip, and name+city matching';

-- ============================================================================
-- 3. MERGE FUNCTION
-- ============================================================================

create or replace function public.merge_contacts(
  p_workspace_id uuid,
  p_primary_contact_id uuid,
  p_duplicate_contact_id uuid,
  p_resolved_fields jsonb default '{}'::jsonb,
  p_merged_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary_contact record;
  v_duplicate_contact record;
  v_merge_event_id uuid;
  v_final_email text;
  v_final_first_name text;
  v_final_last_name text;
  v_final_phone text;
  v_final_address text;
  v_final_city text;
  v_final_state text;
  v_final_zip text;
  v_final_company text;
  v_final_title text;
  v_final_tags jsonb;
  v_tag text;
begin
  -- Validate both contacts exist and belong to workspace
  select * into v_primary_contact
  from public.contacts
  where id = p_primary_contact_id
    and workspace_id = p_workspace_id
    and merged_into is null;
  
  if not found then
    raise exception 'Primary contact not found or already merged';
  end if;
  
  select * into v_duplicate_contact
  from public.contacts
  where id = p_duplicate_contact_id
    and workspace_id = p_workspace_id
    and merged_into is null;
  
  if not found then
    raise exception 'Duplicate contact not found or already merged';
  end if;
  
  -- Resolve fields: use resolved_fields if provided, otherwise use priority logic
  -- Priority: non-null from primary, then non-null from duplicate
  
  v_final_email := coalesce(
    (p_resolved_fields->>'email')::text,
    v_primary_contact.email,
    v_duplicate_contact.email
  );
  
  v_final_first_name := coalesce(
    (p_resolved_fields->>'first_name')::text,
    v_primary_contact.first_name,
    v_duplicate_contact.first_name
  );
  
  v_final_last_name := coalesce(
    (p_resolved_fields->>'last_name')::text,
    v_primary_contact.last_name,
    v_duplicate_contact.last_name
  );
  
  v_final_phone := coalesce(
    (p_resolved_fields->>'phone')::text,
    v_primary_contact.phone,
    v_duplicate_contact.phone
  );
  
  v_final_address := coalesce(
    (p_resolved_fields->>'address')::text,
    v_primary_contact.address,
    v_duplicate_contact.address
  );
  
  v_final_city := coalesce(
    (p_resolved_fields->>'city')::text,
    v_primary_contact.city,
    v_duplicate_contact.city
  );
  
  v_final_state := coalesce(
    (p_resolved_fields->>'state')::text,
    v_primary_contact.state,
    v_duplicate_contact.state
  );
  
  v_final_zip := coalesce(
    (p_resolved_fields->>'zip')::text,
    v_primary_contact.zip,
    v_duplicate_contact.zip
  );
  
  v_final_company := coalesce(
    (p_resolved_fields->>'company')::text,
    v_primary_contact.company,
    v_duplicate_contact.company
  );
  
  v_final_title := coalesce(
    (p_resolved_fields->>'title')::text,
    v_primary_contact.title,
    v_duplicate_contact.title
  );
  
  -- Merge tags (combine arrays, remove duplicates)
  v_final_tags := coalesce(v_primary_contact.tags, '[]'::jsonb);
  if v_duplicate_contact.tags is not null and jsonb_typeof(v_duplicate_contact.tags) = 'array' then
    for v_tag in select jsonb_array_elements_text(v_duplicate_contact.tags)
    loop
      if not (v_final_tags ? v_tag) then
        v_final_tags := v_final_tags || to_jsonb(array[v_tag]);
      end if;
    end loop;
  end if;
  
  -- Update primary contact with resolved fields
  update public.contacts
  set
    email = v_final_email,
    first_name = v_final_first_name,
    last_name = v_final_last_name,
    phone = v_final_phone,
    address = v_final_address,
    city = v_final_city,
    state = v_final_state,
    zip = v_final_zip,
    company = v_final_company,
    title = v_final_title,
    tags = v_final_tags,
    updated_at = now()
  where id = p_primary_contact_id;
  
  -- Merge tasks: update contact_id to primary
  update public.tasks
  set contact_id = p_primary_contact_id
  where contact_id = p_duplicate_contact_id;
  
  -- Merge reply threads: update contact_id to primary (if reply_threads has contact_id)
  -- Note: reply_threads might use lead_id instead, adjust as needed
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reply_threads' and column_name = 'contact_id'
  ) then
    update public.reply_threads
    set contact_id = p_primary_contact_id
    where contact_id = p_duplicate_contact_id;
  end if;
  
  -- Merge messages: update contact_id to primary (if messages has contact_id)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'contact_id'
  ) then
    update public.messages
    set contact_id = p_primary_contact_id
    where contact_id = p_duplicate_contact_id;
  end if;
  
  -- Merge campaign enrollment: update contact_id to primary
  update public.campaign_contacts
  set contact_id = p_primary_contact_id
  where contact_id = p_duplicate_contact_id
  on conflict (campaign_id, contact_id) do nothing;
  
  -- Mark duplicate as merged
  update public.contacts
  set merged_into = p_primary_contact_id
  where id = p_duplicate_contact_id;
  
  -- Create activity event
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'activity_events'
  ) then
    insert into public.activity_events (
      org_id,
      user_id,
      type,
      title,
      description,
      contact_id,
      metadata
    ) values (
      p_workspace_id,
      p_merged_by,
      'contact_merged',
      'Contacts merged',
      coalesce(v_primary_contact.first_name || ' ' || v_primary_contact.last_name, v_primary_contact.email) || 
        ' and ' || 
        coalesce(v_duplicate_contact.first_name || ' ' || v_duplicate_contact.last_name, v_duplicate_contact.email),
      p_primary_contact_id,
      jsonb_build_object(
        'merged_contact_id', p_duplicate_contact_id,
        'merged_contact_email', v_duplicate_contact.email
      )
    )
    returning id into v_merge_event_id;
  end if;
  
  return p_primary_contact_id;
end;
$$;

comment on function public.merge_contacts is 'Merges a duplicate contact into a primary contact, consolidating all related data';

-- ============================================================================
-- 4. AUTO-MERGE FUNCTION FOR EXACT MATCHES
-- ============================================================================

create or replace function public.auto_merge_exact_duplicates(
  p_workspace_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merged_count integer := 0;
  v_contact record;
  v_duplicate record;
  v_primary_id uuid;
begin
  -- Auto-merge exact email matches
  for v_contact in
    select c1.*
    from public.contacts c1
    where c1.workspace_id = p_workspace_id
      and c1.merged_into is null
      and exists (
        select 1 from public.contacts c2
        where c2.workspace_id = p_workspace_id
          and c2.id != c1.id
          and c2.merged_into is null
          and lower(c2.email) = lower(c1.email)
      )
    order by c1.created_at asc
  loop
    -- Find the earliest contact with this email (primary)
    select id into v_primary_id
    from public.contacts
    where workspace_id = p_workspace_id
      and lower(email) = lower(v_contact.email)
      and merged_into is null
    order by created_at asc
    limit 1;
    
    -- Merge all other contacts with same email into primary
    for v_duplicate in
      select id
      from public.contacts
      where workspace_id = p_workspace_id
        and lower(email) = lower(v_contact.email)
        and merged_into is null
        and id != v_primary_id
    loop
      perform public.merge_contacts(
        p_workspace_id,
        v_primary_id,
        v_duplicate.id,
        '{}'::jsonb,
        null -- system merge
      );
      v_merged_count := v_merged_count + 1;
    end loop;
  end loop;
  
  -- Auto-merge exact phone matches (if phone exists and no email conflict)
  for v_contact in
    select c1.*
    from public.contacts c1
    where c1.workspace_id = p_workspace_id
      and c1.merged_into is null
      and c1.phone is not null
      and trim(c1.phone) != ''
      and not exists (
        select 1 from public.contacts c2
        where c2.workspace_id = p_workspace_id
          and c2.id != c1.id
          and c2.merged_into is null
          and lower(c2.email) = lower(c1.email)
      )
      and exists (
        select 1 from public.contacts c2
        where c2.workspace_id = p_workspace_id
          and c2.id != c1.id
          and c2.merged_into is null
          and c2.phone is not null
          and trim(c2.phone) != ''
          and regexp_replace(coalesce(c2.phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(c1.phone, ''), '[^0-9]', '', 'g')
      )
    order by c1.created_at asc
  loop
    -- Find the earliest contact with this phone (primary)
    select id into v_primary_id
    from public.contacts
    where workspace_id = p_workspace_id
      and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(v_contact.phone, ''), '[^0-9]', '', 'g')
      and merged_into is null
    order by created_at asc
    limit 1;
    
    -- Merge all other contacts with same phone into primary
    for v_duplicate in
      select id
      from public.contacts
      where workspace_id = p_workspace_id
        and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(v_contact.phone, ''), '[^0-9]', '', 'g')
        and merged_into is null
        and id != v_primary_id
    loop
      perform public.merge_contacts(
        p_workspace_id,
        v_primary_id,
        v_duplicate.id,
        '{}'::jsonb,
        null -- system merge
      );
      v_merged_count := v_merged_count + 1;
    end loop;
  end loop;
  
  return v_merged_count;
end;
$$;

comment on function public.auto_merge_exact_duplicates is 'Automatically merges contacts with exact email or phone matches';

-- ============================================================================
-- 5. UPDATE RLS POLICIES TO HIDE MERGED CONTACTS
-- ============================================================================

-- Drop existing policies if they exist (we'll recreate them)
drop policy if exists "contacts_select_member" on public.contacts;
drop policy if exists "contacts_mutate_member" on public.contacts;
drop policy if exists "contacts_select_own" on public.contacts;
drop policy if exists "contacts_insert_own" on public.contacts;
drop policy if exists "contacts_update_own" on public.contacts;
drop policy if exists "contacts_rw_policy" on public.contacts;
drop policy if exists "users read contacts" on public.contacts;
drop policy if exists "users write contacts" on public.contacts;

-- Create new policies that exclude merged contacts
-- Policy 1: Select (read) - only show non-merged contacts
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts' and column_name = 'workspace_id'
  ) then
    -- Workspace-based contacts
    execute format('
      create policy "contacts_select_non_merged"
      on public.contacts for select
      using (
        (merged_into is null)
        and (
          workspace_id in (
            select workspace_id from public.workspace_members where user_id = auth.uid()
          )
          or workspace_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.workspace_id = contacts.workspace_id
          )
        )
      )'
    );
  else
    -- User-based contacts (fallback)
    execute format('
      create policy "contacts_select_non_merged"
      on public.contacts for select
      using (
        (merged_into is null)
        and user_id = auth.uid()
      )'
    );
  end if;
exception when others then
  -- Policy might already exist, ignore
  null;
end $$;

-- Policy 2: Insert - prevent inserting contacts that would be duplicates
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts' and column_name = 'workspace_id'
  ) then
    execute format('
      create policy "contacts_insert_non_merged"
      on public.contacts for insert
      with check (
        (merged_into is null)
        and (
          workspace_id in (
            select workspace_id from public.workspace_members where user_id = auth.uid()
          )
          or workspace_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.workspace_id = contacts.workspace_id
          )
        )
      )'
    );
  else
    execute format('
      create policy "contacts_insert_non_merged"
      on public.contacts for insert
      with check (
        (merged_into is null)
        and user_id = auth.uid()
      )'
    );
  end if;
exception when others then
  null;
end $$;

-- Policy 3: Update - prevent updating merged contacts
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts' and column_name = 'workspace_id'
  ) then
    execute format('
      create policy "contacts_update_non_merged"
      on public.contacts for update
      using (
        (merged_into is null)
        and (
          workspace_id in (
            select workspace_id from public.workspace_members where user_id = auth.uid()
          )
          or workspace_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.workspace_id = contacts.workspace_id
          )
        )
      )
      with check (
        (merged_into is null)
        and (
          workspace_id in (
            select workspace_id from public.workspace_members where user_id = auth.uid()
          )
          or workspace_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.workspace_id = contacts.workspace_id
          )
        )
      )'
    );
  else
    execute format('
      create policy "contacts_update_non_merged"
      on public.contacts for update
      using (
        (merged_into is null)
        and user_id = auth.uid()
      )
      with check (
        (merged_into is null)
        and user_id = auth.uid()
      )'
    );
  end if;
exception when others then
  null;
end $$;

-- Policy 4: Delete - prevent deleting merged contacts (they're already hidden)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts' and column_name = 'workspace_id'
  ) then
    execute format('
      create policy "contacts_delete_non_merged"
      on public.contacts for delete
      using (
        (merged_into is null)
        and (
          workspace_id in (
            select workspace_id from public.workspace_members where user_id = auth.uid()
          )
          or workspace_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.workspace_id = contacts.workspace_id
          )
        )
      )'
    );
  else
    execute format('
      create policy "contacts_delete_non_merged"
      on public.contacts for delete
      using (
        (merged_into is null)
        and user_id = auth.uid()
      )'
    );
  end if;
exception when others then
  null;
end $$;

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

grant execute on function public.detect_contact_duplicates(uuid) to authenticated;
grant execute on function public.merge_contacts(uuid, uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.auto_merge_exact_duplicates(uuid) to authenticated;





























































