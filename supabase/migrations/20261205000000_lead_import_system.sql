-- Lead Import System
-- Implements CSV upload → parse → validate → preview → commit pipeline with dedupe + safe upsert

-- ============================================
-- 1) Upload sessions table
-- ============================================
create table if not exists public.lead_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  storage_path text not null,                -- e.g. imports/{user}/{id}.csv
  status text not null default 'pending' check (status in ('pending','parsing','mapped','validating','ready','committing','done','error')),
  total_rows int default 0,
  valid_rows int default 0,
  invalid_rows int default 0,
  error_msg text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_lead_uploads_user on public.lead_uploads(user_id);
create index if not exists idx_lead_uploads_campaign on public.lead_uploads(campaign_id);
create index if not exists idx_lead_uploads_status on public.lead_uploads(status);

-- ============================================
-- 2) Row staging table
-- ============================================
create table if not exists public.lead_upload_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.lead_uploads(id) on delete cascade,
  rownum int not null,
  raw jsonb not null,                        -- unmodified columns
  normalized jsonb default '{}'::jsonb,      -- normalized fields (email, names, etc.)
  errors text[] default '{}',
  valid boolean default false
);

create index if not exists idx_lur_upload on public.lead_upload_rows(upload_id);
create unique index if not exists uq_lur_upload_row on public.lead_upload_rows(upload_id, rownum);

-- ============================================
-- 3) Mapping presets table
-- ============================================
create table if not exists public.mapping_presets (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null check (owner_scope in ('user','org')),  -- who owns this preset
  owner_id uuid not null,                                           -- user_id or org_id
  name text not null,                                               -- e.g., "Apollo CSV"
  mapping jsonb not null,                                           -- {"Email":"email","First Name":"first_name",...}
  created_at timestamptz default now(),
  unique (owner_scope, owner_id, name)
);

create index if not exists idx_mapping_presets_owner on public.mapping_presets(owner_scope, owner_id);

-- ============================================
-- 4) Add columns to leads table if missing
-- ============================================
alter table public.leads
  add column if not exists email_domain text,
  add column if not exists source text default 'import',
  add column if not exists meta jsonb default '{}'::jsonb;

-- Ensure unique constraint exists
create unique index if not exists uq_leads_campaign_email on public.leads(campaign_id, lower(email));

-- ============================================
-- 5) RLS Policies
-- ============================================
alter table public.lead_uploads enable row level security;
alter table public.lead_upload_rows enable row level security;
alter table public.mapping_presets enable row level security;

-- View own or campaign members
create policy "uploads.select.members"
on public.lead_uploads for select
using (
  user_id = auth.uid()
  or public.can_view_campaign(campaign_id)
);

create policy "uploads.insert.members"
on public.lead_uploads for insert
with check (public.can_view_campaign(campaign_id));

create policy "uploads.update.owner"
on public.lead_uploads for update
using (user_id = auth.uid());

create policy "rows.select.members"
on public.lead_upload_rows for select
using (
  exists(
    select 1 from public.lead_uploads u 
    where u.id = upload_id 
    and (u.user_id = auth.uid() or public.can_view_campaign(u.campaign_id))
  )
);

-- Service-only writes to rows
revoke all on public.lead_upload_rows from anon, authenticated;

create policy "presets.select.mine"
on public.mapping_presets for select
using (
  (owner_scope = 'user' and owner_id = auth.uid())
  or (owner_scope = 'org' and public.can_view_org(owner_id))
);

create policy "presets.upsert.mine"
on public.mapping_presets
for insert
with check (
  (owner_scope = 'user' and owner_id = auth.uid())
  or (owner_scope = 'org' and public.can_edit_org(owner_id))
);

create policy "presets.delete.mine"
on public.mapping_presets
for delete
using (
  (owner_scope = 'user' and owner_id = auth.uid())
  or (owner_scope = 'org' and public.can_edit_org(owner_id))
);

-- ============================================
-- 6) Safe upsert function for leads
-- ============================================
create or replace function public.safe_upsert_leads(
  p_upload_id uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_campaign_id uuid;
  v_inserted int := 0;
  v_skipped int := 0;
  v_processed int := 0;
begin
  -- Get campaign_id
  select campaign_id into v_campaign_id
  from public.lead_uploads
  where id = p_upload_id and status = 'ready';
  
  if v_campaign_id is null then
    raise exception 'Upload not found or not ready';
  end if;

  -- Process rows in batches
  for r in (
    select normalized, valid
    from public.lead_upload_rows
    where upload_id = p_upload_id and valid = true
    order by rownum
  ) loop
    -- Build upsert payload, skipping empty values
    declare
      v_norm jsonb := r.normalized;
      v_payload jsonb := jsonb_build_object(
        'campaign_id', v_campaign_id,
        'email', lower(v_norm->>'email'),
        'email_domain', v_norm->>'email_domain',
        'source', 'import',
        'meta', v_norm
      );
    begin
      -- Only include non-empty fields
      if v_norm->>'first_name' is not null and v_norm->>'first_name' != '' then
        v_payload := v_payload || jsonb_build_object('first_name', v_norm->>'first_name');
      end if;
      if v_norm->>'last_name' is not null and v_norm->>'last_name' != '' then
        v_payload := v_payload || jsonb_build_object('last_name', v_norm->>'last_name');
      end if;
      if v_norm->>'name' is not null and v_norm->>'name' != '' then
        v_payload := v_payload || jsonb_build_object('name', v_norm->>'name');
      end if;
      if v_norm->>'company' is not null and v_norm->>'company' != '' then
        v_payload := v_payload || jsonb_build_object('company', v_norm->>'company');
      end if;
      if v_norm->>'title' is not null and v_norm->>'title' != '' then
        v_payload := v_payload || jsonb_build_object('title', v_norm->>'title');
      end if;
      if v_norm->>'website' is not null and v_norm->>'website' != '' then
        v_payload := v_payload || jsonb_build_object('website', v_norm->>'website');
      end if;

      -- Upsert with conflict handling on unique constraint
      begin
        insert into public.leads (campaign_id, email, email_domain, first_name, last_name, name, company, title, website, source, meta)
        select 
          v_payload->>'campaign_id',
          v_payload->>'email',
          nullif(v_payload->>'email_domain', ''),
          nullif(v_payload->>'first_name', ''),
          nullif(v_payload->>'last_name', ''),
          nullif(v_payload->>'name', ''),
          nullif(v_payload->>'company', ''),
          nullif(v_payload->>'title', ''),
          nullif(v_payload->>'website', ''),
          v_payload->>'source',
          v_payload->'meta'
        on conflict (campaign_id, email) do update
          set
            -- Only update if incoming value is non-empty
            first_name = coalesce(nullif(v_payload->>'first_name', ''), leads.first_name),
            last_name = coalesce(nullif(v_payload->>'last_name', ''), leads.last_name),
            name = coalesce(nullif(v_payload->>'name', ''), leads.name),
            company = coalesce(nullif(v_payload->>'company', ''), leads.company),
            title = coalesce(nullif(v_payload->>'title', ''), leads.title),
            website = coalesce(nullif(v_payload->>'website', ''), leads.website),
            meta = leads.meta || v_payload->'meta',  -- merge meta objects
            updated_at = now();
        
        v_inserted := v_inserted + 1;
      exception when unique_violation then
        v_skipped := v_skipped + 1;
      end;
    end;
    
    v_processed := v_processed + 1;
  end loop;

  -- Mark upload as done
  update public.lead_uploads
  set status = 'done', updated_at = now()
  where id = p_upload_id;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'processed', v_processed);
end;
$$;

grant execute on function public.safe_upsert_leads(uuid) to service_role;

