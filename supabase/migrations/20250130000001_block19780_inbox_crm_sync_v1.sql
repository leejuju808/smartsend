-- =========================================================
-- Block 19780 — Inbox → CRM Sync v1
-- (Seamless Flow From Replies → Contacts → Jobs → True CRM Integration)
-- =========================================================
--
-- This block creates the bridge:
-- Inbox → Contact → Job → Pipeline → Future CRM
--
-- We're not building the full CRM here.
-- We're wiring the sync logic, data model, and plumbing that makes CRM possible later.
--
-- This turns the Inbox into the front door of the entire SmartSend ecosystem.
-- =========================================================

-- ============================================================================
-- PART 1 — Contact Auto-Enrichment From Inbox
-- ============================================================================
-- When a homeowner replies, we enrich the contact record automatically

-- Add enrichment fields to contacts table
ALTER TABLE IF EXISTS public.contacts
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS insurance_mentioned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS roof_type_mentioned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pain_points jsonb DEFAULT '[]'::jsonb;

-- Add index for address searches
CREATE INDEX IF NOT EXISTS idx_contacts_address ON public.contacts(workspace_id, address) WHERE address IS NOT NULL;

-- Add index for insurance/roof type filtering
CREATE INDEX IF NOT EXISTS idx_contacts_enrichment ON public.contacts(workspace_id, insurance_mentioned, roof_type_mentioned);

-- ============================================================================
-- PART 2 — Contact Status Sync
-- ============================================================================
-- Add status field to contacts for CRM pipeline tracking

-- Create contact_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_status') THEN
    CREATE TYPE contact_status AS ENUM (
      'lead',
      'active',
      'booked',
      'in-progress',
      'won',
      'lost',
      'follow-up'
    );
  END IF;
END$$;

-- Add status column to contacts
ALTER TABLE IF EXISTS public.contacts
  ADD COLUMN IF NOT EXISTS status contact_status DEFAULT 'lead';

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_contacts_status ON public.contacts(workspace_id, status);

-- ============================================================================
-- PART 3 — Pipeline Sync Logic (CRM Jobs Table)
-- ============================================================================
-- Create crm_jobs table to sync job data from inbox actions

CREATE TABLE IF NOT EXISTS public.crm_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  job_type text, -- e.g., 'roof_replacement', 'roof_repair', 'storm_damage_claim', etc.
  estimated_value numeric(12,2),
  probability integer DEFAULT 80 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date date,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'pending', 'won', 'lost')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for CRM jobs
CREATE INDEX IF NOT EXISTS idx_crm_jobs_contact_id ON public.crm_jobs(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_jobs_thread_id ON public.crm_jobs(thread_id);
CREATE INDEX IF NOT EXISTS idx_crm_jobs_status ON public.crm_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crm_jobs_expected_close_date ON public.crm_jobs(expected_close_date);
CREATE INDEX IF NOT EXISTS idx_crm_jobs_created_at ON public.crm_jobs(created_at DESC);

-- Updated_at trigger for crm_jobs
CREATE OR REPLACE FUNCTION public.set_crm_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_crm_jobs_updated_at ON public.crm_jobs;
CREATE TRIGGER trg_set_crm_jobs_updated_at
BEFORE UPDATE ON public.crm_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_crm_jobs_updated_at();

-- ============================================================================
-- PART 4 — CRM Activity Log Integration
-- ============================================================================
-- Every action in Inbox writes an event to crm_activity table

CREATE TABLE IF NOT EXISTS public.crm_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.crm_jobs(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'reply_received',
    'lead_scored_hot',
    'job_booked',
    'job_won',
    'job_lost',
    'task_created',
    'contact_enriched',
    'status_changed',
    'follow_up_created'
  )),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for CRM activity
CREATE INDEX IF NOT EXISTS idx_crm_activity_contact_id ON public.crm_activity(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_activity_job_id ON public.crm_activity(job_id);
CREATE INDEX IF NOT EXISTS idx_crm_activity_thread_id ON public.crm_activity(thread_id);
CREATE INDEX IF NOT EXISTS idx_crm_activity_event_type ON public.crm_activity(event_type);
CREATE INDEX IF NOT EXISTS idx_crm_activity_created_at ON public.crm_activity(created_at DESC);

-- ============================================================================
-- PART 1 CONTINUED — Contact Enrichment Functions
-- ============================================================================
-- NLP extraction functions for enriching contacts from message bodies

-- Function to extract phone number from text
CREATE OR REPLACE FUNCTION public.extract_phone_from_text(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_phone text;
BEGIN
  -- Match common phone patterns: (555) 123-4567, 555-123-4567, 555.123.4567, 5551234567
  SELECT regexp_replace(
    (regexp_match(p_text, '\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'))[1],
    '[^0-9]', '', 'g'
  ) INTO v_phone;
  
  -- Return formatted if found and valid (10 digits)
  IF v_phone IS NOT NULL AND length(v_phone) = 10 THEN
    RETURN '(' || substring(v_phone, 1, 3) || ') ' || substring(v_phone, 4, 3) || '-' || substring(v_phone, 7, 4);
  END IF;
  
  RETURN NULL;
END;
$$;

-- Function to extract address from text
CREATE OR REPLACE FUNCTION public.extract_address_from_text(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_address text;
BEGIN
  -- Match common address patterns: "123 Main St", "123 Main Street", "123 Main St, City, State 12345"
  SELECT (regexp_match(
    p_text,
    '\d+\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Place|Pl)[^,]*',
    'i'
  ))[1] INTO v_address;
  
  RETURN v_address;
END;
$$;

-- Function to detect insurance mentions
CREATE OR REPLACE FUNCTION public.detect_insurance_mention(p_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_text ~* '(insurance|claim|adjuster|coverage|deductible|policy)';
END;
$$;

-- Function to detect roof type mentions
CREATE OR REPLACE FUNCTION public.detect_roof_type_mention(p_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_text ~* '(shingle|tile|metal|asphalt|slate|flat roof|gable|hip)';
END;
$$;

-- Function to extract pain points
CREATE OR REPLACE FUNCTION public.extract_pain_points(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_pain_points jsonb := '[]'::jsonb;
  v_text_lower text := lower(p_text);
BEGIN
  -- Storm damage
  IF v_text_lower ~* '(storm|hail|wind|hurricane|tornado|damage)' THEN
    v_pain_points := v_pain_points || '"storm_damage"'::jsonb;
  END IF;
  
  -- Leak
  IF v_text_lower ~* '(leak|leaking|water|drip|moisture)' THEN
    v_pain_points := v_pain_points || '"leak"'::jsonb;
  END IF;
  
  -- Age/wear
  IF v_text_lower ~* '(old|worn|age|replace|replacement|worn out)' THEN
    v_pain_points := v_pain_points || '"age_wear"'::jsonb;
  END IF;
  
  -- Urgency
  IF v_text_lower ~* '(urgent|asap|soon|immediate|emergency)' THEN
    v_pain_points := v_pain_points || '"urgent"'::jsonb;
  END IF;
  
  RETURN v_pain_points;
END;
$$;

-- Main enrichment function
CREATE OR REPLACE FUNCTION public.enrich_contact_from_message(
  p_contact_id uuid,
  p_message_body text,
  p_sender_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phone text;
  v_address text;
  v_insurance boolean;
  v_roof_type boolean;
  v_pain_points jsonb;
  v_updates jsonb := '{}'::jsonb;
BEGIN
  -- Extract phone
  v_phone := public.extract_phone_from_text(p_message_body);
  IF v_phone IS NOT NULL THEN
    UPDATE public.contacts
    SET phone = COALESCE(phone, v_phone)
    WHERE id = p_contact_id AND phone IS NULL;
    v_updates := v_updates || jsonb_build_object('phone', v_phone);
  END IF;
  
  -- Extract address
  v_address := public.extract_address_from_text(p_message_body);
  IF v_address IS NOT NULL THEN
    UPDATE public.contacts
    SET address = COALESCE(address, v_address)
    WHERE id = p_contact_id AND address IS NULL;
    v_updates := v_updates || jsonb_build_object('address', v_address);
  END IF;
  
  -- Detect insurance
  v_insurance := public.detect_insurance_mention(p_message_body);
  IF v_insurance THEN
    UPDATE public.contacts
    SET insurance_mentioned = true
    WHERE id = p_contact_id;
    v_updates := v_updates || jsonb_build_object('insurance_mentioned', true);
  END IF;
  
  -- Detect roof type
  v_roof_type := public.detect_roof_type_mention(p_message_body);
  IF v_roof_type THEN
    UPDATE public.contacts
    SET roof_type_mentioned = true
    WHERE id = p_contact_id;
    v_updates := v_updates || jsonb_build_object('roof_type_mentioned', true);
  END IF;
  
  -- Extract pain points
  v_pain_points := public.extract_pain_points(p_message_body);
  IF jsonb_array_length(v_pain_points) > 0 THEN
    UPDATE public.contacts
    SET pain_points = COALESCE(pain_points, '[]'::jsonb) || v_pain_points
    WHERE id = p_contact_id;
    v_updates := v_updates || jsonb_build_object('pain_points', v_pain_points);
  END IF;
  
  -- Update notes with mention summary
  IF jsonb_object_keys(v_updates) IS NOT NULL THEN
    UPDATE public.contacts
    SET notes = COALESCE(notes || E'\n', '') || 
        'Mentioned: ' || array_to_string(
          ARRAY[
            CASE WHEN v_insurance THEN 'insurance' END,
            CASE WHEN v_roof_type THEN 'roof type' END,
            CASE WHEN v_pain_points ? 'storm_damage' THEN 'storm damage' END,
            CASE WHEN v_pain_points ? 'leak' THEN 'leak' END
          ]::text[],
          ', '
        )
    WHERE id = p_contact_id;
  END IF;
  
  -- Log enrichment activity
  INSERT INTO public.crm_activity (contact_id, event_type, metadata)
  VALUES (p_contact_id, 'contact_enriched', v_updates);
  
  RETURN v_updates;
END;
$$;

-- ============================================================================
-- PART 2 CONTINUED — Contact Status Sync Triggers
-- ============================================================================
-- Sync contact status when thread status changes

CREATE OR REPLACE FUNCTION public.sync_contact_status_from_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_thread_status text;
BEGIN
  -- Get contact_id from thread (assuming inbox_threads has contact_id or we get it from lead)
  -- This is a placeholder - adjust based on your actual schema
  SELECT contact_id INTO v_contact_id
  FROM public.inbox_threads
  WHERE id = NEW.id;
  
  -- If no contact_id on thread, try to get from lead
  IF v_contact_id IS NULL THEN
    SELECT c.id INTO v_contact_id
    FROM public.leads l
    JOIN public.contacts c ON c.email = l.email AND c.workspace_id = l.workspace_id
    WHERE l.id = NEW.lead_id
    LIMIT 1;
  END IF;
  
  IF v_contact_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Map thread status to contact status
  -- This assumes inbox_threads has a status field or closed_reason
  -- Adjust based on your actual schema
  IF NEW.closed_reason = 'booked_estimate' THEN
    UPDATE public.contacts
    SET status = 'booked'::contact_status
    WHERE id = v_contact_id;
    
    -- Log activity
    INSERT INTO public.crm_activity (contact_id, thread_id, event_type, metadata)
    VALUES (v_contact_id, NEW.id, 'status_changed', jsonb_build_object('new_status', 'booked'));
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 3 CONTINUED — CRM Job Sync Functions
-- ============================================================================
-- Functions to sync jobs from inbox actions

CREATE OR REPLACE FUNCTION public.sync_crm_job_from_action(
  p_thread_id uuid,
  p_contact_id uuid,
  p_action_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_job_type text;
  v_estimated_value numeric(12,2);
  v_probability integer;
  v_expected_close_date date;
  v_status text;
  v_notes text;
BEGIN
  -- Extract job data from metadata
  v_job_type := NULLIF(p_metadata->>'job_type', '');
  v_estimated_value := NULLIF((p_metadata->>'estimated_value')::numeric, NULL);
  v_probability := COALESCE(NULLIF((p_metadata->>'probability')::integer, NULL), 80);
  v_expected_close_date := NULLIF((p_metadata->>'expected_close_date')::date, NULL);
  v_notes := NULLIF(p_metadata->>'notes', '');
  
  -- Determine status based on action type
  CASE p_action_type
    WHEN 'mark_booked' THEN
      v_status := 'booked';
    WHEN 'mark_won' THEN
      v_status := 'won';
    WHEN 'mark_lost' THEN
      v_status := 'lost';
    ELSE
      v_status := 'pending';
  END CASE;
  
  -- Check if job already exists
  SELECT id INTO v_job_id
  FROM public.crm_jobs
  WHERE contact_id = p_contact_id 
    AND thread_id = p_thread_id
  LIMIT 1;
  
  -- Upsert CRM job
  IF v_job_id IS NOT NULL THEN
    -- Update existing job
    UPDATE public.crm_jobs
    SET 
      job_type = COALESCE(v_job_type, job_type),
      estimated_value = COALESCE(v_estimated_value, estimated_value),
      probability = COALESCE(v_probability, probability),
      expected_close_date = COALESCE(v_expected_close_date, expected_close_date),
      status = v_status,
      notes = COALESCE(v_notes, notes),
      updated_at = now()
    WHERE id = v_job_id;
  ELSE
    -- Insert new job
    INSERT INTO public.crm_jobs (
      contact_id,
      thread_id,
      job_type,
      estimated_value,
      probability,
      expected_close_date,
      status,
      notes
    )
    VALUES (
      p_contact_id,
      p_thread_id,
      v_job_type,
      v_estimated_value,
      v_probability,
      v_expected_close_date,
      v_status,
      v_notes
    )
    RETURNING id INTO v_job_id;
  END IF;
  
  -- Update contact status
  IF v_status = 'booked' THEN
    UPDATE public.contacts
    SET status = 'booked'::contact_status
    WHERE id = p_contact_id;
  ELSIF v_status = 'won' THEN
    UPDATE public.contacts
    SET status = 'won'::contact_status
    WHERE id = p_contact_id;
  ELSIF v_status = 'lost' THEN
    UPDATE public.contacts
    SET status = 'lost'::contact_status
    WHERE id = p_contact_id;
  END IF;
  
  -- Log activity
  INSERT INTO public.crm_activity (contact_id, job_id, thread_id, event_type, metadata)
  VALUES (
    p_contact_id,
    v_job_id,
    p_thread_id,
    CASE v_status
      WHEN 'booked' THEN 'job_booked'
      WHEN 'won' THEN 'job_won'
      WHEN 'lost' THEN 'job_lost'
      ELSE 'status_changed'
    END,
    p_metadata
  );
  
  RETURN v_job_id;
END;
$$;

-- ============================================================================
-- PART 6 — CRM Data Quality Guardrails
-- ============================================================================
-- Validation and normalization functions

-- Function to validate phone number
CREATE OR REPLACE FUNCTION public.validate_phone(p_phone text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Remove all non-digit characters
  p_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  -- Must be 10 digits (US phone number)
  RETURN length(p_phone) = 10;
END;
$$;

-- Function to normalize phone number
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
BEGIN
  -- Remove all non-digit characters
  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  -- Format as (XXX) XXX-XXXX
  IF length(v_digits) = 10 THEN
    RETURN '(' || substring(v_digits, 1, 3) || ') ' || substring(v_digits, 4, 3) || '-' || substring(v_digits, 7, 4);
  END IF;
  
  RETURN p_phone; -- Return original if can't normalize
END;
$$;

-- Function to normalize name (title case)
CREATE OR REPLACE FUNCTION public.normalize_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_name IS NULL OR p_name = '' THEN
    RETURN NULL;
  END IF;
  
  -- Convert to title case (first letter uppercase, rest lowercase)
  RETURN initcap(lower(trim(p_name)));
END;
$$;

-- Function to detect duplicate contacts
CREATE OR REPLACE FUNCTION public.detect_duplicate_contacts(
  p_workspace_id uuid,
  p_email text,
  p_phone text DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_duplicate_ids uuid[];
BEGIN
  -- Find contacts with same email
  SELECT array_agg(id) INTO v_duplicate_ids
  FROM public.contacts
  WHERE workspace_id = p_workspace_id
    AND lower(email) = lower(p_email);
  
  -- Also check by phone if provided
  IF p_phone IS NOT NULL THEN
    SELECT array_agg(id) INTO v_duplicate_ids
    FROM public.contacts
    WHERE workspace_id = p_workspace_id
      AND phone IS NOT NULL
      AND regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
      AND (v_duplicate_ids IS NULL OR id != ALL(v_duplicate_ids));
    
    -- Combine arrays
    IF v_duplicate_ids IS NULL THEN
      SELECT array_agg(id) INTO v_duplicate_ids
      FROM public.contacts
      WHERE workspace_id = p_workspace_id
        AND phone IS NOT NULL
        AND regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g');
    END IF;
  END IF;
  
  RETURN COALESCE(v_duplicate_ids, ARRAY[]::uuid[]);
END;
$$;

-- Function to auto-tag storm events
CREATE OR REPLACE FUNCTION public.auto_tag_storm_event(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_message_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_storm_pattern text;
  v_city text;
  v_date_pattern text;
BEGIN
  -- Detect storm mentions with location and date patterns
  IF p_message_body ~* '(storm|hail|wind|hurricane|tornado)' THEN
    -- Try to extract city (simplified - can be enhanced)
    SELECT (regexp_match(p_message_body, 'in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', 'i'))[1] INTO v_city;
    
    -- Try to extract date/month
    SELECT (regexp_match(p_message_body, '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}', 'i'))[1] INTO v_date_pattern;
    
    -- Create storm tag
    v_storm_pattern := COALESCE(v_city || ' Storm', 'Storm Event');
    IF v_date_pattern IS NOT NULL THEN
      v_storm_pattern := v_storm_pattern || ' — ' || v_date_pattern;
    END IF;
    
    -- Add tag to contact
    UPDATE public.contacts
    SET tags = CASE
      WHEN tags IS NULL THEN ARRAY[v_storm_pattern]
      WHEN tags::text[] @> ARRAY[v_storm_pattern] THEN tags
      ELSE tags || v_storm_pattern
    END
    WHERE id = p_contact_id;
  END IF;
END;
$$;

-- ============================================================================
-- PART 7 — Cross-Module Consistency
-- ============================================================================
-- Ensure all modules sync with CRM

-- Function to sync campaign engagement to CRM
CREATE OR REPLACE FUNCTION public.sync_campaign_engagement_to_crm(
  p_contact_id uuid,
  p_campaign_id uuid,
  p_engagement_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log campaign engagement as CRM activity
  INSERT INTO public.crm_activity (contact_id, event_type, metadata)
  VALUES (
    p_contact_id,
    'reply_received', -- or other appropriate event type
    jsonb_build_object(
      'campaign_id', p_campaign_id,
      'engagement_type', p_engagement_type
    ) || p_metadata
  );
END;
$$;

-- Function to sync task creation to CRM
CREATE OR REPLACE FUNCTION public.sync_task_to_crm(
  p_contact_id uuid,
  p_task_id uuid,
  p_task_title text,
  p_due_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log task creation as CRM activity
  INSERT INTO public.crm_activity (contact_id, event_type, metadata)
  VALUES (
    p_contact_id,
    'task_created',
    jsonb_build_object(
      'task_id', p_task_id,
      'task_title', p_task_title,
      'due_date', p_due_date
    )
  );
  
  -- Update contact status to follow-up if needed
  UPDATE public.contacts
  SET status = 'follow-up'::contact_status
  WHERE id = p_contact_id AND status NOT IN ('won', 'lost');
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.crm_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crm_jobs
DROP POLICY IF EXISTS "crm_jobs_select" ON public.crm_jobs;
CREATE POLICY "crm_jobs_select"
  ON public.crm_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = crm_jobs.contact_id
        AND c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "crm_jobs_insert" ON public.crm_jobs;
CREATE POLICY "crm_jobs_insert"
  ON public.crm_jobs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = crm_jobs.contact_id
        AND c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "crm_jobs_update" ON public.crm_jobs;
CREATE POLICY "crm_jobs_update"
  ON public.crm_jobs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = crm_jobs.contact_id
        AND c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

-- RLS Policies for crm_activity
DROP POLICY IF EXISTS "crm_activity_select" ON public.crm_activity;
CREATE POLICY "crm_activity_select"
  ON public.crm_activity
  FOR SELECT
  USING (
    contact_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = crm_activity.contact_id
        AND c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "crm_activity_insert" ON public.crm_activity;
CREATE POLICY "crm_activity_insert"
  ON public.crm_activity
  FOR INSERT
  WITH CHECK (
    contact_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = crm_activity.contact_id
        AND c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

-- ============================================================================
-- PART 1 CONTINUED — Automatic Enrichment Trigger
-- ============================================================================
-- Trigger to automatically enrich contacts when inbound messages are received

CREATE OR REPLACE FUNCTION public.auto_enrich_contact_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_message_body text;
  v_sender_email text;
  v_thread_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Only process inbound messages
  IF COALESCE(NEW.direction, '') != 'inbound' THEN
    RETURN NEW;
  END IF;
  
  -- Get message body (access columns directly - works for both reply_messages and inbox_messages)
  -- These columns should exist in both tables based on the schema
  v_message_body := COALESCE(
    NEW.body_text,
    NEW.body_html,
    NEW.body,
    NEW.snippet,
    ''
  );
  
  -- Get sender email
  v_sender_email := COALESCE(NEW.from_email, NEW.sender_email, '');
  
  -- Get thread_id
  v_thread_id := NEW.thread_id;
  
  -- Skip if no thread_id or sender_email
  IF v_thread_id IS NULL OR v_sender_email = '' OR v_sender_email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Find contact by email from thread
  SELECT c.id, c.workspace_id INTO v_contact_id, v_workspace_id
  FROM public.inbox_threads t
  JOIN public.campaigns camp ON camp.id = t.campaign_id
  JOIN public.contacts c ON c.email = v_sender_email AND c.workspace_id = camp.workspace_id
  WHERE t.id = v_thread_id
  LIMIT 1;
  
  -- If no contact found, try to find by lead
  IF v_contact_id IS NULL THEN
    SELECT c.id, c.workspace_id INTO v_contact_id, v_workspace_id
    FROM public.inbox_threads t
    JOIN public.leads l ON l.id = t.lead_id
    JOIN public.contacts c ON c.email = l.email
    WHERE t.id = v_thread_id
      AND c.workspace_id = COALESCE(l.workspace_id, (SELECT workspace_id FROM public.campaigns WHERE id = t.campaign_id))
    LIMIT 1;
  END IF;
  
  -- If still no contact, try direct email match (create contact if needed)
  IF v_contact_id IS NULL AND v_thread_id IS NOT NULL THEN
    -- Get workspace_id from thread
    SELECT camp.workspace_id INTO v_workspace_id
    FROM public.inbox_threads t
    JOIN public.campaigns camp ON camp.id = t.campaign_id
    WHERE t.id = v_thread_id
    LIMIT 1;
    
    -- Try to find existing contact
    IF v_workspace_id IS NOT NULL THEN
      SELECT id INTO v_contact_id
      FROM public.contacts
      WHERE email = v_sender_email AND workspace_id = v_workspace_id
      LIMIT 1;
      
      -- Create contact if doesn't exist
      IF v_contact_id IS NULL THEN
        INSERT INTO public.contacts (workspace_id, email, first_name, source)
        VALUES (v_workspace_id, v_sender_email, NULL, 'reply_capture')
        RETURNING id INTO v_contact_id;
      END IF;
    END IF;
  END IF;
  
  -- Enrich contact if found
  IF v_contact_id IS NOT NULL AND v_message_body != '' THEN
    -- Use direct SQL update instead of function call to avoid recursion issues
    BEGIN
      -- Extract and update phone
      UPDATE public.contacts
      SET phone = COALESCE(phone, public.extract_phone_from_text(v_message_body))
      WHERE id = v_contact_id AND phone IS NULL;
      
      -- Extract and update address
      UPDATE public.contacts
      SET address = COALESCE(address, public.extract_address_from_text(v_message_body))
      WHERE id = v_contact_id AND address IS NULL;
      
      -- Update insurance flag
      IF public.detect_insurance_mention(v_message_body) THEN
        UPDATE public.contacts
        SET insurance_mentioned = true
        WHERE id = v_contact_id;
      END IF;
      
      -- Update roof type flag
      IF public.detect_roof_type_mention(v_message_body) THEN
        UPDATE public.contacts
        SET roof_type_mentioned = true
        WHERE id = v_contact_id;
      END IF;
      
      -- Update pain points
      UPDATE public.contacts
      SET pain_points = COALESCE(pain_points, '[]'::jsonb) || public.extract_pain_points(v_message_body)
      WHERE id = v_contact_id;
      
      -- Auto-tag storm events
      IF v_workspace_id IS NOT NULL THEN
        PERFORM public.auto_tag_storm_event(v_workspace_id, v_contact_id, v_message_body);
      END IF;
      
      -- Log reply received activity
      INSERT INTO public.crm_activity (contact_id, thread_id, event_type, metadata)
      VALUES (
        v_contact_id,
        v_thread_id,
        'reply_received',
        jsonb_build_object('message_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      -- Silently fail enrichment to avoid breaking message insertion
      NULL;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on reply_messages (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reply_messages') THEN
    DROP TRIGGER IF EXISTS trg_auto_enrich_contact_on_message ON public.reply_messages;
    EXECUTE 'CREATE TRIGGER trg_auto_enrich_contact_on_message
      AFTER INSERT ON public.reply_messages
      FOR EACH ROW
      WHEN (NEW.direction = ''inbound'')
      EXECUTE FUNCTION public.auto_enrich_contact_on_message()';
  END IF;
END$$;

-- Also create trigger on inbox_messages if that table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inbox_messages') THEN
    DROP TRIGGER IF EXISTS trg_auto_enrich_contact_on_inbox_message ON public.inbox_messages;
    EXECUTE 'CREATE TRIGGER trg_auto_enrich_contact_on_inbox_message
      AFTER INSERT ON public.inbox_messages
      FOR EACH ROW
      WHEN (NEW.direction = ''inbound'')
      EXECUTE FUNCTION public.auto_enrich_contact_on_message()';
  END IF;
END$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.crm_jobs IS 'CRM jobs table that syncs job pipeline data from inbox actions. Bridges Inbox → CRM pipeline.';
COMMENT ON TABLE public.crm_activity IS 'CRM activity log that synchronizes EVERYTHING for future CRM analytics. Every action in Inbox writes an event here.';
COMMENT ON COLUMN public.contacts.status IS 'Contact status for CRM pipeline: lead, active, booked, in-progress, won, lost, follow-up';
COMMENT ON COLUMN public.contacts.address IS 'Address extracted from email body using regex';
COMMENT ON COLUMN public.contacts.notes IS 'Notes field for CRM context (e.g., "Mentioned: leak, storm damage")';
COMMENT ON COLUMN public.contacts.insurance_mentioned IS 'Boolean flag indicating if insurance was mentioned in messages';
COMMENT ON COLUMN public.contacts.roof_type_mentioned IS 'Boolean flag indicating if roof type was mentioned in messages';
COMMENT ON COLUMN public.contacts.pain_points IS 'JSONB array of pain points extracted from messages (e.g., ["storm_damage", "leak", "urgent"])';

COMMENT ON FUNCTION public.enrich_contact_from_message IS 'Main enrichment function that extracts phone, address, insurance mentions, roof type, and pain points from message body';
COMMENT ON FUNCTION public.sync_crm_job_from_action IS 'Syncs CRM job from inbox action. Called when user clicks Mark as Booked, Won, or Lost';
COMMENT ON FUNCTION public.detect_duplicate_contacts IS 'Detects duplicate contacts by email or phone for data quality';
COMMENT ON FUNCTION public.auto_tag_storm_event IS 'Auto-tags storm events for batch pattern detection (e.g., "Seattle Storm — Oct 2025")';

