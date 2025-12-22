-- Block 272 — Smart Send Windows v1
-- Timezone-aware sending with per-lead business hours

-- 1. Add timezone columns to leads and companies
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS timezone text;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS timezone text;

-- 2. Add local_send_window to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS local_send_window jsonb DEFAULT '{"start": "09:00", "end": "17:00"}'::jsonb;

-- 3. Add workspace-level send window settings
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS global_send_window_start time DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS global_send_window_end time DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS respect_lead_timezone boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS restrict_to_business_days boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_send_hours jsonb DEFAULT '[]'::jsonb; -- Array of {start: "22:00", end: "06:00"}

-- 4. Indexes for timezone queries
CREATE INDEX IF NOT EXISTS idx_leads_timezone ON public.leads(timezone) WHERE timezone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_timezone ON public.companies(timezone) WHERE timezone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_local_send_window ON public.leads USING gin(local_send_window) WHERE local_send_window IS NOT NULL;

-- 5. Helper function: Detect timezone from lead/company data
CREATE OR REPLACE FUNCTION public.detect_lead_timezone(p_lead_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_lead_timezone text;
  v_company_timezone text;
  v_company_id uuid;
  v_country text;
  v_state text;
  v_city text;
BEGIN
  -- Check if lead already has timezone
  SELECT timezone INTO v_lead_timezone
  FROM public.leads
  WHERE id = p_lead_id;
  
  IF v_lead_timezone IS NOT NULL THEN
    RETURN v_lead_timezone;
  END IF;
  
  -- Get company timezone if available
  SELECT company_id INTO v_company_id
  FROM public.leads
  WHERE id = p_lead_id;
  
  IF v_company_id IS NOT NULL THEN
    SELECT timezone INTO v_company_timezone
    FROM public.companies
    WHERE id = v_company_id;
    
    IF v_company_timezone IS NOT NULL THEN
      RETURN v_company_timezone;
    END IF;
    
    -- Try to get location from company
    SELECT country, state, city INTO v_country, v_state, v_city
    FROM public.companies
    WHERE id = v_company_id;
  END IF;
  
  -- Try enrichment data
  IF v_country IS NULL THEN
    SELECT country INTO v_country
    FROM public.leads
    WHERE id = p_lead_id;
  END IF;
  
  -- Lookup timezone from country (simplified - can be enhanced with state/city)
  IF v_country IS NOT NULL THEN
    SELECT tz INTO v_lead_timezone
    FROM public.country_default_tz
    WHERE country = v_country;
    
    IF v_lead_timezone IS NOT NULL THEN
      RETURN v_lead_timezone;
    END IF;
  END IF;
  
  -- Fallback: return NULL (will use workspace default)
  RETURN NULL;
END;
$$;

-- 6. Helper function: Get next valid send time for a lead
CREATE OR REPLACE FUNCTION public.get_next_valid_send_time(
  p_lead_id uuid,
  p_workspace_id uuid,
  p_current_time timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_lead_timezone text;
  v_workspace_timezone text;
  v_local_window jsonb;
  v_window_start text;
  v_window_end text;
  v_current_local timestamptz;
  v_next_local timestamptz;
  v_workspace_restrict_business_days boolean;
  v_day_of_week int;
  v_global_window_start time;
  v_global_window_end time;
BEGIN
  -- Get lead timezone
  v_lead_timezone := public.detect_lead_timezone(p_lead_id);
  
  -- Get workspace timezone and settings
  SELECT 
    sending_timezone,
    restrict_to_business_days,
    global_send_window_start,
    global_send_window_end
  INTO
    v_workspace_timezone,
    v_workspace_restrict_business_days,
    v_global_window_start,
    v_global_window_end
  FROM public.workspaces
  WHERE id = p_workspace_id;
  
  -- Use workspace timezone if lead timezone not available
  IF v_lead_timezone IS NULL THEN
    v_lead_timezone := COALESCE(v_workspace_timezone, 'UTC');
  END IF;
  
  -- Get lead's local send window
  SELECT local_send_window INTO v_local_window
  FROM public.leads
  WHERE id = p_lead_id;
  
  -- Default window if not set
  IF v_local_window IS NULL THEN
    v_local_window := '{"start": "09:00", "end": "17:00"}'::jsonb;
  END IF;
  
  v_window_start := v_local_window->>'start';
  v_window_end := v_local_window->>'end';
  
  -- Convert current time to lead's local timezone
  v_current_local := (p_current_time AT TIME ZONE 'UTC') AT TIME ZONE v_lead_timezone;
  
  -- Parse window times
  -- Extract hour and minute from "HH:MM" format
  DECLARE
    v_start_hour int := (regexp_split_to_array(v_window_start, ':'))[1]::int;
    v_start_min int := (regexp_split_to_array(v_window_start, ':'))[2]::int;
    v_end_hour int := (regexp_split_to_array(v_window_end, ':'))[1]::int;
    v_end_min int := (regexp_split_to_array(v_window_end, ':'))[2]::int;
    v_current_hour int := EXTRACT(HOUR FROM v_current_local)::int;
    v_current_min int := EXTRACT(MINUTE FROM v_current_local)::int;
    v_current_time_minutes int := v_current_hour * 60 + v_current_min;
    v_start_minutes int := v_start_hour * 60 + v_start_min;
    v_end_minutes int := v_end_hour * 60 + v_end_min;
  BEGIN
    -- Set next time to start of window today
    v_next_local := date_trunc('day', v_current_local) + 
                     (v_start_hour || ' hours')::interval + 
                     (v_start_min || ' minutes')::interval;
    
    -- If we're past the window today, move to tomorrow
    IF v_current_time_minutes >= v_end_minutes THEN
      v_next_local := v_next_local + interval '1 day';
    ELSIF v_current_time_minutes < v_start_minutes THEN
      -- Before window start - use today's start
      -- v_next_local already set correctly
    ELSE
      -- We're in the window - can send now
      RETURN p_current_time;
    END IF;
    
    -- Check if we need to skip weekends
    IF v_workspace_restrict_business_days THEN
      v_day_of_week := EXTRACT(DOW FROM v_next_local)::int;
      -- 0 = Sunday, 6 = Saturday
      WHILE v_day_of_week = 0 OR v_day_of_week = 6 LOOP
        v_next_local := v_next_local + interval '1 day';
        v_day_of_week := EXTRACT(DOW FROM v_next_local)::int;
      END LOOP;
    END IF;
    
    -- Convert back to UTC
    RETURN (v_next_local AT TIME ZONE v_lead_timezone) AT TIME ZONE 'UTC';
  END;
END;
$$;

-- 7. Helper function: Check if current time is within send window
CREATE OR REPLACE FUNCTION public.is_within_send_window(
  p_lead_id uuid,
  p_workspace_id uuid,
  p_check_time timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_lead_timezone text;
  v_workspace_timezone text;
  v_local_window jsonb;
  v_window_start text;
  v_window_end text;
  v_check_local timestamptz;
  v_workspace_restrict_business_days boolean;
  v_day_of_week int;
BEGIN
  -- Get lead timezone
  v_lead_timezone := public.detect_lead_timezone(p_lead_id);
  
  -- Get workspace settings
  SELECT 
    sending_timezone,
    restrict_to_business_days
  INTO
    v_workspace_timezone,
    v_workspace_restrict_business_days
  FROM public.workspaces
  WHERE id = p_workspace_id;
  
  -- Use workspace timezone if lead timezone not available
  IF v_lead_timezone IS NULL THEN
    v_lead_timezone := COALESCE(v_workspace_timezone, 'UTC');
  END IF;
  
  -- Check weekend restriction
  IF v_workspace_restrict_business_days THEN
    v_check_local := (p_check_time AT TIME ZONE 'UTC') AT TIME ZONE v_lead_timezone;
    v_day_of_week := EXTRACT(DOW FROM v_check_local)::int;
    IF v_day_of_week = 0 OR v_day_of_week = 6 THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Get lead's local send window
  SELECT local_send_window INTO v_local_window
  FROM public.leads
  WHERE id = p_lead_id;
  
  -- Default window if not set
  IF v_local_window IS NULL THEN
    v_local_window := '{"start": "09:00", "end": "17:00"}'::jsonb;
  END IF;
  
  v_window_start := v_local_window->>'start';
  v_window_end := v_local_window->>'end';
  
  -- Convert check time to lead's local timezone
  v_check_local := (p_check_time AT TIME ZONE 'UTC') AT TIME ZONE v_lead_timezone;
  
  -- Check if within window
  DECLARE
    v_start_hour int := (regexp_split_to_array(v_window_start, ':'))[1]::int;
    v_start_min int := (regexp_split_to_array(v_window_start, ':'))[2]::int;
    v_end_hour int := (regexp_split_to_array(v_window_end, ':'))[1]::int;
    v_end_min int := (regexp_split_to_array(v_window_end, ':'))[2]::int;
    v_check_hour int := EXTRACT(HOUR FROM v_check_local)::int;
    v_check_min int := EXTRACT(MINUTE FROM v_check_local)::int;
    v_check_minutes int := v_check_hour * 60 + v_check_min;
    v_start_minutes int := v_start_hour * 60 + v_start_min;
    v_end_minutes int := v_end_hour * 60 + v_end_min;
  BEGIN
    RETURN v_check_minutes >= v_start_minutes AND v_check_minutes < v_end_minutes;
  END;
END;
$$;

-- 8. Update timezone on lead enrichment (trigger)
CREATE OR REPLACE FUNCTION public.update_lead_timezone_on_enrichment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_detected_tz text;
BEGIN
  -- Only update if timezone is not already set
  IF NEW.timezone IS NULL THEN
    v_detected_tz := public.detect_lead_timezone(NEW.id);
    IF v_detected_tz IS NOT NULL THEN
      NEW.timezone := v_detected_tz;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger (will fire on lead updates)
DROP TRIGGER IF EXISTS trg_update_lead_timezone ON public.leads;
CREATE TRIGGER trg_update_lead_timezone
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  WHEN (NEW.timezone IS NULL OR OLD.company_id IS DISTINCT FROM NEW.company_id)
  EXECUTE FUNCTION public.update_lead_timezone_on_enrichment();

-- 9. Update apply_lead_enrichment to also detect timezone
CREATE OR REPLACE FUNCTION public.apply_lead_enrichment_with_timezone(p_lead uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_detected_tz text;
BEGIN
  -- Call existing apply_lead_enrichment if it exists
  -- This is a wrapper that adds timezone detection
  BEGIN
    PERFORM public.apply_lead_enrichment(p_lead);
  EXCEPTION
    WHEN undefined_function THEN
      -- Function doesn't exist, skip
      NULL;
  END;
  
  -- Detect and update timezone
  v_detected_tz := public.detect_lead_timezone(p_lead);
  IF v_detected_tz IS NOT NULL THEN
    UPDATE public.leads
    SET timezone = v_detected_tz
    WHERE id = p_lead AND timezone IS NULL;
  END IF;
END;
$$;

-- 10. Helper function: Extract timezone from company location data
CREATE OR REPLACE FUNCTION public.extract_timezone_from_location(
  p_country text,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tz text;
BEGIN
  -- First try country-level default
  IF p_country IS NOT NULL THEN
    SELECT tz INTO v_tz
    FROM public.country_default_tz
    WHERE country = p_country;
    
    IF v_tz IS NOT NULL THEN
      RETURN v_tz;
    END IF;
  END IF;
  
  -- Could add state/city-level lookups here in the future
  -- For now, return NULL (will use workspace default)
  RETURN NULL;
END;
$$;

COMMENT ON COLUMN public.leads.timezone IS 'Lead timezone (IANA timezone name) for local-time send window enforcement. Detected from company, enrichment, or falls back to workspace default.';
COMMENT ON COLUMN public.leads.local_send_window IS 'Local business hours for this lead. Format: {"start": "09:00", "end": "17:00"}. Defaults to 9am-5pm local time.';
COMMENT ON COLUMN public.companies.timezone IS 'Company timezone (IANA timezone name) detected from location data. Used as fallback for leads without explicit timezone.';
COMMENT ON COLUMN public.workspaces.respect_lead_timezone IS 'If true, sends respect each lead''s local timezone. If false, all sends use workspace timezone.';
COMMENT ON COLUMN public.workspaces.restrict_to_business_days IS 'If true, sends are blocked on weekends (Saturday and Sunday).';
COMMENT ON COLUMN public.workspaces.do_not_send_hours IS 'Global "do not send" hours (workspace time). Array of {start: "22:00", end: "06:00"} objects.';

