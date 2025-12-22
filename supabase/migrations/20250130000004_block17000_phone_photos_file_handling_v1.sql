-- =========================================================
-- Block 17000 — SmartSend Phone, Photos & File Handling v1
-- (Roofing Reality Features: MMS Photo Intake, Document Uploads, 
--  Insurance Paperwork, Before/After Shots & Mobile-Friendly Media Flow)
-- =========================================================

-- ============================================================================
-- 1. ENHANCE ATTACHMENTS TABLE WITH AI FIELDS
-- ============================================================================

-- Add new columns to attachments table for AI categorization and organization
alter table public.attachments
  add column if not exists folder text, -- Auto-assigned folder: 'Roof Photos', 'Damage Photos', 'Insurance Documents', 'Job Quotes', 'Before/After', 'Other Files'
  add column if not exists ai_label text, -- AI-generated label: 'Shingle damage', 'Hail damage', 'Wind damage', etc.
  add column if not exists ai_tags text[] default '{}', -- Array of AI-detected tags
  add column if not exists detected_damage_type text, -- Specific damage type detected: 'hail', 'wind', 'leak', 'gutter', 'skylight', 'general'
  add column if not exists photo_analysis_id uuid, -- Reference to photo_analysis table
  add column if not exists insurance_doc_id uuid; -- Reference to insurance_docs table

-- Create index for folder lookups
create index if not exists attachments_folder_idx on public.attachments(folder) where folder is not null;
create index if not exists attachments_damage_type_idx on public.attachments(detected_damage_type) where detected_damage_type is not null;
create index if not exists attachments_ai_label_idx on public.attachments(ai_label) where ai_label is not null;

-- ============================================================================
-- 2. CREATE PHOTO_ANALYSIS TABLE
-- ============================================================================

create table if not exists public.photo_analysis (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references public.attachments(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  detected_damage_type text, -- 'shingle_damage', 'hail_damage', 'wind_damage', 'leak_water_stain', 'gutter_damage', 'skylight_issue', 'general_roof_overview', 'insurance_document', 'before_after_photo'
  confidence numeric(5,2) check (confidence >= 0 and confidence <= 100), -- 0-100 confidence score
  ai_tags text[] default '{}', -- Additional tags detected
  analysis_metadata jsonb default '{}', -- Full AI response/metadata
  analyzed_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Indexes for photo analysis
create index if not exists photo_analysis_attachment_idx on public.photo_analysis(attachment_id);
create index if not exists photo_analysis_contact_idx on public.photo_analysis(contact_id);
create index if not exists photo_analysis_damage_type_idx on public.photo_analysis(detected_damage_type) where detected_damage_type is not null;
create index if not exists photo_analysis_org_idx on public.photo_analysis(org_id);

-- Add foreign key from attachments to photo_analysis
alter table public.attachments
  add constraint attachments_photo_analysis_fk 
  foreign key (photo_analysis_id) references public.photo_analysis(id) on delete set null;

-- ============================================================================
-- 3. CREATE INSURANCE_DOCS TABLE
-- ============================================================================

create table if not exists public.insurance_docs (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references public.attachments(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  claim_number text,
  deductible numeric(12,2),
  acv numeric(12,2), -- Actual Cash Value
  rcv numeric(12,2), -- Replacement Cost Value
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  inspection_date date,
  date_of_loss date,
  carrier_name text, -- Insurance company name
  policy_number text,
  extracted_metadata jsonb default '{}', -- Full extracted text and metadata
  extracted_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Indexes for insurance docs
create index if not exists insurance_docs_attachment_idx on public.insurance_docs(attachment_id);
create index if not exists insurance_docs_contact_idx on public.insurance_docs(contact_id);
create index if not exists insurance_docs_org_idx on public.insurance_docs(org_id);
create index if not exists insurance_docs_claim_number_idx on public.insurance_docs(claim_number) where claim_number is not null;
create index if not exists insurance_docs_carrier_idx on public.insurance_docs(carrier_name) where carrier_name is not null;

-- Add foreign key from attachments to insurance_docs
alter table public.attachments
  add constraint attachments_insurance_doc_fk 
  foreign key (insurance_doc_id) references public.insurance_docs(id) on delete set null;

-- ============================================================================
-- 4. FUNCTION TO AUTO-ASSIGN FOLDER BASED ON FILE TYPE AND AI ANALYSIS
-- ============================================================================

create or replace function public.auto_assign_attachment_folder()
returns trigger
language plpgsql
as $$
declare
  v_folder text;
  v_file_type text;
  v_damage_type text;
  v_ai_label text;
begin
  v_file_type := NEW.file_type;
  v_damage_type := NEW.detected_damage_type;
  v_ai_label := NEW.ai_label;

  -- Determine folder based on file type and analysis
  if v_file_type like 'image/%' then
    -- Photo categorization
    if v_damage_type in ('hail_damage', 'wind_damage', 'shingle_damage', 'gutter_damage', 'skylight_issue', 'leak_water_stain') then
      v_folder := 'Damage Photos';
    elsif v_ai_label ilike '%before%' or v_ai_label ilike '%after%' then
      v_folder := 'Before/After';
    elsif v_ai_label ilike '%insurance%' or v_file_type = 'application/pdf' then
      -- Check if it's an insurance document
      if exists (select 1 from public.insurance_docs where attachment_id = NEW.id) then
        v_folder := 'Insurance Documents';
      else
        v_folder := 'Roof Photos';
      end if;
    else
      v_folder := 'Roof Photos';
    end if;
  elsif v_file_type = 'application/pdf' then
    -- PDF categorization
    if exists (select 1 from public.insurance_docs where attachment_id = NEW.id) then
      v_folder := 'Insurance Documents';
    elsif NEW.linked_to = 'estimate' or NEW.linked_to = 'quote' then
      v_folder := 'Job Quotes';
    else
      v_folder := 'Insurance Documents'; -- Default PDFs to insurance docs (most common for roofers)
    end if;
  else
    v_folder := 'Other Files';
  end if;

  NEW.folder := v_folder;
  return NEW;
end;
$$;

-- Trigger to auto-assign folder on insert/update
drop trigger if exists trg_auto_assign_attachment_folder on public.attachments;
create trigger trg_auto_assign_attachment_folder
  before insert or update on public.attachments
  for each row
  execute function public.auto_assign_attachment_folder();

-- ============================================================================
-- 5. FUNCTION TO UPDATE CONTACT PIPELINE BASED ON PHOTO ANALYSIS
-- ============================================================================

create or replace function public.update_pipeline_from_photo_analysis()
returns trigger
language plpgsql
security definer
as $$
declare
  v_contact_id uuid;
  v_org_id uuid;
  v_damage_type text;
  v_pipeline_stage_key text;
begin
  -- Get contact and org info
  select contact_id, org_id into v_contact_id, v_org_id
  from public.attachments
  where id = NEW.attachment_id;

  if not found then
    return NEW;
  end if;

  v_damage_type := NEW.detected_damage_type;

  -- Determine pipeline stage based on damage type
  if v_damage_type in ('hail_damage', 'wind_damage') then
    -- Move to Insurance Opportunity stage
    v_pipeline_stage_key := 'insurance_opportunity';
  elsif v_damage_type = 'leak_water_stain' then
    -- Move to Hot Lead stage (urgent)
    v_pipeline_stage_key := 'hot_lead';
  elsif v_damage_type = 'skylight_issue' then
    -- Keep current stage but flag for skylight upsell
    v_pipeline_stage_key := null; -- Don't change stage, but can add metadata
  else
    -- General roof damage - increase job value estimate
    v_pipeline_stage_key := null; -- Don't change stage automatically
  end if;

  -- Update contact pipeline stage if determined
  if v_pipeline_stage_key is not null then
    -- Find pipeline stage by key
    update public.contacts c
    set 
      pipeline_stage_key = v_pipeline_stage_key,
      updated_at = now()
    where c.id = v_contact_id
      and c.org_id = v_org_id
      and exists (
        select 1 from public.pipeline_stages ps
        where ps.key = v_pipeline_stage_key
        and ps.workspace_id = (select workspace_id from public.organizations where id = v_org_id)
      );
  end if;

  return NEW;
end;
$$;

-- Trigger to update pipeline when photo analysis is created
drop trigger if exists trg_update_pipeline_from_photo_analysis on public.photo_analysis;
create trigger trg_update_pipeline_from_photo_analysis
  after insert on public.photo_analysis
  for each row
  execute function public.update_pipeline_from_photo_analysis();

-- ============================================================================
-- 6. FUNCTION TO UPDATE INSURANCE LIKELIHOOD FROM INSURANCE DOCS
-- ============================================================================

create or replace function public.update_insurance_likelihood_from_doc()
returns trigger
language plpgsql
security definer
as $$
declare
  v_contact_id uuid;
  v_org_id uuid;
  v_claim_number text;
  v_carrier_name text;
begin
  v_contact_id := NEW.contact_id;
  v_org_id := NEW.org_id;
  v_claim_number := NEW.claim_number;
  v_carrier_name := NEW.carrier_name;

  -- Update contact with insurance information
  if v_claim_number is not null or v_carrier_name is not null then
    update public.contacts
    set 
      -- Set insurance likelihood to 'high' if we have claim number or carrier
      -- Note: Adjust field name based on your contacts schema
      updated_at = now()
    where id = v_contact_id
      and org_id = v_org_id;
  end if;

  return NEW;
end;
$$;

-- Trigger to update insurance likelihood when insurance doc is created
drop trigger if exists trg_update_insurance_likelihood_from_doc on public.insurance_docs;
create trigger trg_update_insurance_likelihood_from_doc
  after insert on public.insurance_docs
  for each row
  execute function public.update_insurance_likelihood_from_doc();

-- ============================================================================
-- 7. ENABLE RLS ON NEW TABLES
-- ============================================================================

alter table public.photo_analysis enable row level security;
alter table public.insurance_docs enable row level security;

-- RLS Policies for photo_analysis
create policy "photo_analysis_view_org_members" on public.photo_analysis
  for select using (
    exists (
      select 1 from public.org_memberships
      where org_id = photo_analysis.org_id
        and user_id = auth.uid()
        and status = 'active'
    )
  );

create policy "photo_analysis_insert_org_members" on public.photo_analysis
  for insert with check (
    exists (
      select 1 from public.org_memberships
      where org_id = photo_analysis.org_id
        and user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'manager', 'staff')
    )
  );

-- RLS Policies for insurance_docs
create policy "insurance_docs_view_org_members" on public.insurance_docs
  for select using (
    exists (
      select 1 from public.org_memberships
      where org_id = insurance_docs.org_id
        and user_id = auth.uid()
        and status = 'active'
    )
  );

create policy "insurance_docs_insert_org_members" on public.insurance_docs
  for insert with check (
    exists (
      select 1 from public.org_memberships
      where org_id = insurance_docs.org_id
        and user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'manager', 'staff')
    )
  );

-- Service role can do everything
create policy "photo_analysis_service_role_full_access" on public.photo_analysis
  for all to service_role
  using (true)
  with check (true);

create policy "insurance_docs_service_role_full_access" on public.insurance_docs
  for all to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 8. UPDATE STORAGE BUCKET TO SUPPORT MP4 VIDEOS
-- ============================================================================

-- Update attachments bucket to allow MP4 videos
update storage.buckets
set allowed_mime_types = array_cat(
  coalesce(allowed_mime_types, array[]::text[]),
  array['video/mp4']
)
where id = 'attachments'
  and not ('video/mp4' = any(coalesce(allowed_mime_types, array[]::text[])));

-- ============================================================================
-- 9. COMMENTS FOR DOCUMENTATION
-- ============================================================================

comment on table public.photo_analysis is 'AI analysis results for uploaded photos, detecting damage types and categorizing roof images';
comment on table public.insurance_docs is 'Extracted insurance document metadata including claim numbers, deductibles, adjuster info, and carrier details';
comment on column public.attachments.folder is 'Auto-assigned folder based on file type and AI analysis: Roof Photos, Damage Photos, Insurance Documents, Job Quotes, Before/After, Other Files';
comment on column public.attachments.ai_label is 'AI-generated label categorizing the photo (e.g., Shingle damage, Hail damage, Before/After photo)';
comment on column public.attachments.detected_damage_type is 'Specific damage type detected by AI: hail_damage, wind_damage, leak_water_stain, gutter_damage, skylight_issue, general_roof_overview';
comment on column public.attachments.ai_tags is 'Array of AI-detected tags for additional categorization';





















































