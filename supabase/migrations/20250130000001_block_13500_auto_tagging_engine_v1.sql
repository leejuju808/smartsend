-- =========================================================
-- Block 13500 — SmartSend Auto-Tagging Engine v1
-- (The Automatic Tag System That Organizes Homeowners Without Roofer Effort)
-- =========================================================

-- This block implements automatic tagging of contacts based on:
-- - Location (neighborhood, city)
-- - Behavior (replies, engagement)
-- - Enrichment data (from Block 13400)
-- - Storm exposure (weather data)
-- - Insurance context (reply keywords)
-- - Personalization data
-- - Past quotes
-- - Interest signals
-- - Lead status

-- ============================================================================
-- 1. ENSURE contact_tags TABLE EXISTS (from Block 11000)
-- ============================================================================

-- The contact_tags table should already exist from Block 11000
-- We'll add a type column if it doesn't exist (to distinguish auto vs manual)
DO $$
BEGIN
  -- Add type column if it doesn't exist (using auto_tagged boolean as fallback)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contact_tags' 
    AND column_name = 'type'
  ) THEN
    ALTER TABLE public.contact_tags
      ADD COLUMN type text CHECK (type IN ('auto', 'manual')) DEFAULT 'manual';
    
    -- Migrate existing auto_tagged boolean to type
    UPDATE public.contact_tags
    SET type = CASE WHEN auto_tagged THEN 'auto' ELSE 'manual' END
    WHERE type IS NULL;
  END IF;
END $$;

-- ============================================================================
-- 2. AUTO-TAGGING FUNCTIONS
-- ============================================================================

-- Function: Apply all auto-tags to a contact
CREATE OR REPLACE FUNCTION public.apply_auto_tags(
  p_contact_id uuid,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact RECORD;
  v_reply_text text;
  v_storm_type text;
  v_neighborhood text;
  v_city text;
  v_zip text;
BEGIN
  -- Get workspace_id if not provided
  IF p_workspace_id IS NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM public.contacts
    WHERE id = p_contact_id
    LIMIT 1;
  ELSE
    v_workspace_id := p_workspace_id;
  END IF;

  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;

  -- Get contact data (handle optional columns gracefully)
  SELECT 
    c.*,
    c.city as contact_city,
    c.postal_code as contact_postal_code,
    c.zip as contact_zip,
    c.lead_status,
    c.storm_risk_level
  INTO v_contact
  FROM public.contacts c
  WHERE c.id = p_contact_id
    AND c.workspace_id = v_workspace_id
  LIMIT 1;

  IF v_contact IS NULL THEN
    RETURN;
  END IF;

  -- Extract values
  v_city := COALESCE(v_contact.contact_city, v_contact.city);
  v_zip := COALESCE(v_contact.contact_zip, v_contact.contact_postal_code);
  v_storm_type := v_contact.storm_risk_level;
  
  -- Try to get neighborhood from enrichment data (if column exists)
  BEGIN
    SELECT c.neighborhood INTO v_neighborhood
    FROM public.contacts c
    WHERE c.id = p_contact_id;
  EXCEPTION WHEN OTHERS THEN
    v_neighborhood := NULL;
  END;

  -- 1️⃣ Neighborhood Tags (from enrichment) - only if neighborhood column exists
  IF v_neighborhood IS NOT NULL AND v_neighborhood != '' THEN
    PERFORM public.add_contact_tag(v_workspace_id, p_contact_id, v_neighborhood, true);
  END IF;

  -- 2️⃣ City Tags
  IF v_city IS NOT NULL AND v_city != '' THEN
    PERFORM public.add_contact_tag(v_workspace_id, p_contact_id, v_city, true);
  END IF;

  -- 3️⃣ Storm Risk Tags
  IF v_storm_type IS NOT NULL AND v_storm_type != 'low' THEN
    PERFORM public.add_contact_tag(v_workspace_id, p_contact_id, 'storm_' || v_storm_type, true);
  END IF;

  -- 4️⃣ Warm Lead Tag (if lead_status = 'warm')
  IF v_contact.lead_status = 'warm' THEN
    PERFORM public.add_contact_tag(v_workspace_id, p_contact_id, 'warm_lead', true);
  END IF;

  -- 5️⃣ Hot Lead Tag (if lead_status = 'hot')
  IF v_contact.lead_status = 'hot' THEN
    PERFORM public.add_contact_tag(v_workspace_id, p_contact_id, 'hot_lead', true);
  END IF;

  -- Check for recent replies to apply reply-based tags
  SELECT body_text INTO v_reply_text
  FROM public.inbound_messages im
  JOIN public.reply_threads rt ON rt.id = im.thread_id
  WHERE rt.contact_id = p_contact_id
    AND rt.workspace_id = v_workspace_id
    AND im.created_at > now() - interval '30 days'
  ORDER BY im.created_at DESC
  LIMIT 1;

  IF v_reply_text IS NOT NULL THEN
    -- Apply reply-based tags
    PERFORM public.apply_reply_tags(p_contact_id, v_workspace_id, v_reply_text);
  END IF;

END;
$$;

-- Function: Apply tags based on reply content
CREATE OR REPLACE FUNCTION public.apply_reply_tags(
  p_contact_id uuid,
  p_workspace_id uuid,
  p_reply_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_text_lower text;
BEGIN
  IF p_reply_text IS NULL THEN
    RETURN;
  END IF;

  v_text_lower := lower(p_reply_text);

  -- 4️⃣ Insurance Interest Tag
  IF v_text_lower ~ '(claim|adjuster|insurance said|covered|payout|insurance approved|insurance will|insurance covers)' THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'insurance_interest', true);
  END IF;

  -- 8️⃣ Repair Needed Tag
  IF v_text_lower ~ '(leak|missing shingles|vent problems|patch|flashing|skylight|damage|broken|repair)' THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'needs_repair', true);
  END IF;

  -- 9️⃣ Replacement Interest Tag
  IF v_text_lower ~ '(replace|full roof|reroof|shingles|old roof|end of life|new roof|entire roof)' THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'replacement_interest', true);
  END IF;

  -- 5️⃣ Old Quote Tag (if reply mentions quote/estimate)
  IF v_text_lower ~ '(quote|estimate|quoted|estimated|previous quote|old quote)' THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'old_quote', true);
  END IF;

  -- 7️⃣ Multi-Property Tag
  IF v_text_lower ~ '(another rental|other place|other property|multiple properties|we own another)' THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'multi_property', true);
  END IF;

  -- 1️⃣1️⃣ Follow-Up Required Tag (if question detected)
  IF v_text_lower ~ '(\?|question|wondering|ask|how much|what|when|where|why|how)' THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'follow_up_required', true);
  END IF;

END;
$$;

-- Function: Apply storm tags to contacts in affected zip codes
CREATE OR REPLACE FUNCTION public.apply_storm_tags(
  p_zip_code text,
  p_storm_type text -- 'hail', 'wind', 'rain', 'freeze'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tag_name text;
BEGIN
  IF p_zip_code IS NULL OR p_storm_type IS NULL THEN
    RETURN;
  END IF;

  v_tag_name := 'storm_' || p_storm_type;

  -- Apply tag to all contacts in this zip code
  PERFORM public.add_contact_tag(c.workspace_id, c.id, v_tag_name, true)
  FROM public.contacts c
  WHERE (c.postal_code = p_zip_code OR c.zip = p_zip_code)
    AND NOT EXISTS (
      SELECT 1 FROM public.contact_tags ct
      WHERE ct.workspace_id = c.workspace_id
        AND ct.contact_id = c.id
        AND ct.tag = v_tag_name
    );

END;
$$;

-- Function: Apply old quote tags from import
CREATE OR REPLACE FUNCTION public.apply_old_quote_tags(
  p_contact_id uuid,
  p_workspace_id uuid,
  p_has_estimate boolean DEFAULT false,
  p_list_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Tag if imported CSV contains past estimate amounts
  IF p_has_estimate THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'old_quote', true);
  END IF;

  -- Tag if contact added to "Old Quotes" list
  IF p_list_name IS NOT NULL AND lower(p_list_name) ~ 'old.*quote|previous.*quote|past.*quote' THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'old_quote', true);
  END IF;

END;
$$;

-- Function: Apply high-value lead tag
CREATE OR REPLACE FUNCTION public.apply_high_value_tag(
  p_contact_id uuid,
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact RECORD;
  v_has_insurance_tag boolean;
  v_has_replacement_tag boolean;
  v_has_hot_tag boolean;
  v_estimate_value numeric;
BEGIN
  -- Get contact data
  SELECT 
    c.*,
    c.lead_status,
    c.estimated_job_value,
    c.est_job_value
  INTO v_contact
  FROM public.contacts c
  WHERE c.id = p_contact_id
    AND c.workspace_id = p_workspace_id
  LIMIT 1;

  IF v_contact IS NULL THEN
    RETURN;
  END IF;

  -- Check for insurance tag
  SELECT EXISTS (
    SELECT 1 FROM public.contact_tags ct
    WHERE ct.workspace_id = p_workspace_id
      AND ct.contact_id = p_contact_id
      AND ct.tag = 'insurance_interest'
  ) INTO v_has_insurance_tag;

  -- Check for replacement tag
  SELECT EXISTS (
    SELECT 1 FROM public.contact_tags ct
    WHERE ct.workspace_id = p_workspace_id
      AND ct.contact_id = p_contact_id
      AND ct.tag = 'replacement_interest'
  ) INTO v_has_replacement_tag;

  -- Check for hot tag
  SELECT EXISTS (
    SELECT 1 FROM public.contact_tags ct
    WHERE ct.workspace_id = p_workspace_id
      AND ct.contact_id = p_contact_id
      AND ct.tag = 'hot_lead'
  ) INTO v_has_hot_tag;

  -- Get estimate value
  v_estimate_value := COALESCE(v_contact.estimated_job_value, v_contact.est_job_value, 0);

  -- Apply high-value tag if conditions met
  IF (
    v_has_hot_tag OR
    (v_has_replacement_tag AND v_has_insurance_tag) OR
    v_estimate_value >= 10000
  ) THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'high_value', true);
  END IF;

END;
$$;

-- Function: Apply low-quality tag
CREATE OR REPLACE FUNCTION public.apply_low_quality_tag(
  p_contact_id uuid,
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact RECORD;
  v_email text;
  v_has_bounce boolean;
  v_has_spam boolean;
  v_disposable_email boolean;
BEGIN
  -- Get contact data
  SELECT c.*, c.email INTO v_contact
  FROM public.contacts c
  WHERE c.id = p_contact_id
    AND c.workspace_id = p_workspace_id
  LIMIT 1;

  IF v_contact IS NULL THEN
    RETURN;
  END IF;

  v_email := lower(v_contact.email);

  -- Check for disposable email domains
  v_disposable_email := v_email ~ '@(10minutemail|tempmail|guerrillamail|mailinator|throwaway|temp-mail|getnada|mohmal|fakeinbox|trashmail|mintemail|yopmail|sharklasers|getairmail|maildrop|mintemail|tempr|emailondeck|mytrashmail|throwawaymail|tempinbox|mailcatch|spamgourmet|spamhole|spamex|spamfree24|spamobox|spamtraps|spamday|spamgourmet|spamhole|spamex|spamfree24|spamobox|spamtraps|spamday)\.';

  -- Check for bounce in suppression list (handle different table structures gracefully)
  BEGIN
    -- Check if suppressions table exists and has workspace_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'suppressions' 
      AND column_name = 'workspace_id'
    ) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.suppressions s
        WHERE s.workspace_id = p_workspace_id
          AND lower(s.email) = v_email
          AND (s.reason::text IN ('bounced', 'complaint') OR s.reason::text LIKE '%bounce%' OR s.reason::text LIKE '%complaint%')
      ) INTO v_has_bounce;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'suppressions'
    ) THEN
      -- Try without workspace_id
      SELECT EXISTS (
        SELECT 1 FROM public.suppressions s
        WHERE lower(s.email) = v_email
          AND (s.reason::text IN ('bounced', 'complaint') OR s.reason::text LIKE '%bounce%' OR s.reason::text LIKE '%complaint%')
      ) INTO v_has_bounce;
    ELSE
      v_has_bounce := false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_has_bounce := false;
  END;

  -- Check for inconsistent address (missing city/zip when address exists)
  IF (v_contact.address IS NOT NULL AND v_contact.address != '') 
     AND (v_contact.city IS NULL OR v_contact.city = '')
     AND (v_contact.postal_code IS NULL OR v_contact.postal_code = '')
     AND (v_contact.zip IS NULL OR v_contact.zip = '') THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'low_quality', true);
    RETURN;
  END IF;

  -- Apply low-quality tag if conditions met
  IF v_disposable_email OR v_has_bounce THEN
    PERFORM public.add_contact_tag(p_workspace_id, p_contact_id, 'low_quality', true);
  END IF;

END;
$$;

-- Function: Remove follow-up tag when status changes to HOT
CREATE OR REPLACE FUNCTION public.sync_tags_with_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Rule 2: Tags sync with lead status
  -- Remove follow-up tag when status changes to HOT
  IF NEW.lead_status = 'hot' AND (OLD.lead_status IS NULL OR OLD.lead_status != 'hot') THEN
    PERFORM public.remove_contact_tag(NEW.workspace_id, NEW.id, 'follow_up_required');
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. TRIGGERS FOR AUTO-TAGGING
-- ============================================================================

-- Trigger function for contact auto-tagging (must be created before trigger)
CREATE OR REPLACE FUNCTION public.trigger_auto_tag_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Apply auto-tags when contact is created or location/enrichment data changes
  PERFORM public.apply_auto_tags(NEW.id, NEW.workspace_id);
  
  -- Apply low-quality check
  PERFORM public.apply_low_quality_tag(NEW.id, NEW.workspace_id);
  
  RETURN NEW;
END;
$$;

-- Trigger: Auto-tag on contact creation/update
-- Note: neighborhood column may not exist in all schemas, so we handle it gracefully in the function
DROP TRIGGER IF EXISTS trg_auto_tag_contact ON public.contacts;
CREATE TRIGGER trg_auto_tag_contact
  AFTER INSERT OR UPDATE OF city, postal_code, zip, storm_risk_level, lead_status ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_tag_contact();
  
-- Also create trigger for neighborhood if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contacts' 
    AND column_name = 'neighborhood'
  ) THEN
    DROP TRIGGER IF EXISTS trg_auto_tag_contact_neighborhood ON public.contacts;
    CREATE TRIGGER trg_auto_tag_contact_neighborhood
      AFTER UPDATE OF neighborhood ON public.contacts
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_auto_tag_contact();
  END IF;
END $$;

-- Trigger: Sync tags with lead status changes
DROP TRIGGER IF EXISTS trg_sync_tags_with_status ON public.contacts;
CREATE TRIGGER trg_sync_tags_with_status
  AFTER UPDATE OF lead_status ON public.contacts
  FOR EACH ROW
  WHEN (OLD.lead_status IS DISTINCT FROM NEW.lead_status)
  EXECUTE FUNCTION public.sync_tags_with_status();

-- Trigger function: Auto-tag on reply (enhance existing trigger from Block 11000)
-- This will be handled by the existing trigger, but we'll add reply content analysis
CREATE OR REPLACE FUNCTION public.auto_tag_on_reply_enhanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_workspace_id uuid;
  v_reply_text text;
BEGIN
  -- Get contact_id and workspace_id from reply_threads
  IF TG_TABLE_NAME = 'reply_threads' THEN
    v_contact_id := NEW.contact_id;
    v_workspace_id := NEW.workspace_id;
  ELSIF TG_TABLE_NAME = 'inbound_messages' THEN
    -- Try to get contact_id from thread
    SELECT rt.contact_id, rt.workspace_id INTO v_contact_id, v_workspace_id
    FROM public.reply_threads rt
    WHERE rt.id = NEW.thread_id
    LIMIT 1;
  END IF;
  
  IF v_contact_id IS NOT NULL AND v_workspace_id IS NOT NULL THEN
    -- Get reply text
    SELECT body_text INTO v_reply_text
    FROM public.inbound_messages
    WHERE thread_id = COALESCE(NEW.thread_id, (SELECT id FROM public.reply_threads WHERE contact_id = v_contact_id ORDER BY last_activity_at DESC LIMIT 1))
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Apply reply-based tags
    IF v_reply_text IS NOT NULL THEN
      PERFORM public.apply_reply_tags(v_contact_id, v_workspace_id, v_reply_text);
    END IF;
    
    -- Apply high-value tag check
    PERFORM public.apply_high_value_tag(v_contact_id, v_workspace_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update existing trigger to use enhanced function (only if reply_threads table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reply_threads') THEN
    DROP TRIGGER IF EXISTS trg_auto_tag_on_reply_thread_enhanced ON public.reply_threads;
    CREATE TRIGGER trg_auto_tag_on_reply_thread_enhanced
      AFTER INSERT OR UPDATE OF last_activity_at ON public.reply_threads
      FOR EACH ROW
      WHEN (NEW.last_direction = 'inbound')
      EXECUTE FUNCTION public.auto_tag_on_reply_enhanced();
  END IF;
END $$;

-- ============================================================================
-- 4. CRON JOB FUNCTIONS (for daily refresh)
-- ============================================================================

-- Function: Daily tag refresh (re-evaluates all contacts)
CREATE OR REPLACE FUNCTION public.refresh_auto_tags_daily()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact RECORD;
  v_count integer := 0;
BEGIN
  -- Process contacts in batches
  FOR v_contact IN
    SELECT id, workspace_id
    FROM public.contacts
    WHERE updated_at > now() - interval '7 days' -- Only refresh recently updated contacts
    ORDER BY updated_at DESC
    LIMIT 1000
  LOOP
    -- Re-apply auto-tags
    PERFORM public.apply_auto_tags(v_contact.id, v_contact.workspace_id);
    
    -- Re-check low-quality
    PERFORM public.apply_low_quality_tag(v_contact.id, v_contact.workspace_id);
    
    -- Re-check high-value
    PERFORM public.apply_high_value_tag(v_contact.id, v_contact.workspace_id);
    
    v_count := v_count + 1;
    
    -- Commit every 100 contacts
    IF v_count % 100 = 0 THEN
      COMMIT;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Refreshed tags for % contacts', v_count;
END;
$$;

-- Function: Storm tag refresh (applies storm tags to affected zips)
CREATE OR REPLACE FUNCTION public.refresh_storm_tags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_storm RECORD;
BEGIN
  -- Get recent storm data from local_context
  FOR v_storm IN
    SELECT DISTINCT zip, storm_type
    FROM public.local_context
    WHERE storm_flag = true
      AND storm_date >= CURRENT_DATE - interval '30 days'
      AND zip IS NOT NULL
      AND storm_type IS NOT NULL
  LOOP
    -- Apply storm tags to all contacts in affected zip
    PERFORM public.apply_storm_tags(v_storm.zip, v_storm.storm_type);
  END LOOP;
END;
$$;

-- Function: Import tag refresh (applies tags based on import metadata)
CREATE OR REPLACE FUNCTION public.refresh_import_tags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact RECORD;
BEGIN
  -- Tag contacts imported from "Old Quotes" lists
  FOR v_contact IN
    SELECT DISTINCT c.id, c.workspace_id, c.source
    FROM public.contacts c
    WHERE c.source IS NOT NULL
      AND lower(c.source) ~ 'old.*quote|previous.*quote|past.*quote'
      AND NOT EXISTS (
        SELECT 1 FROM public.contact_tags ct
        WHERE ct.workspace_id = c.workspace_id
          AND ct.contact_id = c.id
          AND ct.tag = 'old_quote'
      )
  LOOP
    PERFORM public.apply_old_quote_tags(
      v_contact.id,
      v_contact.workspace_id,
      false,
      v_contact.source
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- 5. HELPER FUNCTION: Get all tags for a contact (for UI)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_contact_tags(
  p_contact_id uuid,
  p_workspace_id uuid
)
RETURNS TABLE(
  tag text,
  type text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ct.tag,
    COALESCE(ct.type, CASE WHEN ct.auto_tagged THEN 'auto' ELSE 'manual' END) as type,
    ct.created_at
  FROM public.contact_tags ct
  WHERE ct.contact_id = p_contact_id
    AND ct.workspace_id = p_workspace_id
  ORDER BY ct.created_at DESC;
END;
$$;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.apply_auto_tags IS 'Applies all automatic tags to a contact based on location, enrichment, status, and replies';
COMMENT ON FUNCTION public.apply_reply_tags IS 'Applies tags based on reply content (insurance, repair, replacement, etc.)';
COMMENT ON FUNCTION public.apply_storm_tags IS 'Applies storm tags to all contacts in an affected zip code';
COMMENT ON FUNCTION public.apply_old_quote_tags IS 'Applies old_quote tag based on import metadata or list name';
COMMENT ON FUNCTION public.apply_high_value_tag IS 'Applies high_value tag to contacts meeting high-value criteria';
COMMENT ON FUNCTION public.apply_low_quality_tag IS 'Applies low_quality tag to contacts with quality issues';
COMMENT ON FUNCTION public.refresh_auto_tags_daily IS 'Daily cron job to refresh auto-tags for recently updated contacts';
COMMENT ON FUNCTION public.refresh_storm_tags IS 'Cron job to refresh storm tags based on recent weather data';
COMMENT ON FUNCTION public.refresh_import_tags IS 'Cron job to apply tags based on import metadata';

-- ============================================================================
-- 7. INITIAL TAG APPLICATION FOR EXISTING CONTACTS (optional, run manually)
-- ============================================================================

-- Note: This can be run manually to tag existing contacts
-- Uncomment and run if needed:
/*
DO $$
DECLARE
  v_contact RECORD;
  v_count integer := 0;
BEGIN
  FOR v_contact IN
    SELECT id, workspace_id
    FROM public.contacts
    LIMIT 10000 -- Process in batches
  LOOP
    PERFORM public.apply_auto_tags(v_contact.id, v_contact.workspace_id);
    v_count := v_count + 1;
    
    IF v_count % 100 = 0 THEN
      RAISE NOTICE 'Processed % contacts', v_count;
    END IF;
  END LOOP;
END $$;
*/

