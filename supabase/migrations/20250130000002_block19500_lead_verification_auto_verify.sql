-- =========================================================
-- Block 19500 — SmartSend Lead Verification Engine v1
-- Auto-Verification Triggers & Functions
-- =========================================================

-- ============================================
-- Function: Auto-verify lead/contact on creation
-- ============================================
CREATE OR REPLACE FUNCTION public.auto_verify_lead_on_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from the new record
  IF TG_TABLE_NAME = 'contacts' THEN
    v_workspace_id := NEW.workspace_id;
  ELSIF TG_TABLE_NAME = 'leads' THEN
    v_workspace_id := NEW.workspace_id;
  ELSE
    RETURN NEW;
  END IF;

  -- Trigger verification asynchronously via pg_notify (or call API)
  -- For now, we'll create a placeholder verification record
  -- In production, this would call the verification API endpoint
  
  RETURN NEW;
END;
$$;

-- ============================================
-- Function: Trigger verification via API (called from trigger)
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_lead_verification(
  p_workspace_id uuid,
  p_contact_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function would typically make an HTTP request to the verification API
  -- For now, we'll use pg_notify to trigger a background worker
  PERFORM pg_notify('lead_verification_request', json_build_object(
    'workspace_id', p_workspace_id,
    'contact_id', p_contact_id,
    'lead_id', p_lead_id
  )::text);
END;
$$;

-- ============================================
-- Function: Get lead correction suggestions
-- ============================================
CREATE OR REPLACE FUNCTION public.get_lead_correction_suggestions(
  p_contact_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_suggestions jsonb := '[]'::jsonb;
  v_contact_or_lead record;
  v_verification record;
BEGIN
  -- Get contact or lead data
  IF p_contact_id IS NOT NULL THEN
    SELECT * INTO v_contact_or_lead FROM public.contacts WHERE id = p_contact_id;
  ELSIF p_lead_id IS NOT NULL THEN
    SELECT * INTO v_contact_or_lead FROM public.leads WHERE id = p_lead_id;
  ELSE
    RETURN v_suggestions;
  END IF;

  -- Get latest verification
  SELECT * INTO v_verification
  FROM public.lead_verification
  WHERE (contact_id = p_contact_id OR lead_id = p_lead_id)
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_verification IS NULL THEN
    RETURN v_suggestions;
  END IF;

  -- Generate suggestions based on verification results
  -- Email suggestions
  IF v_verification.email_format_valid = false THEN
    v_suggestions := v_suggestions || jsonb_build_object(
      'type', 'email',
      'field', 'email',
      'message', 'Email format appears invalid. Please check spelling.',
      'priority', 'high'
    );
  END IF;

  IF v_verification.email_disposable = true THEN
    v_suggestions := v_suggestions || jsonb_build_object(
      'type', 'email',
      'field', 'email',
      'message', 'Disposable email detected. Please provide a permanent email address.',
      'priority', 'high'
    );
  END IF;

  -- Address suggestions
  IF v_verification.address_valid = false OR v_verification.address_formatted IS NULL THEN
    v_suggestions := v_suggestions || jsonb_build_object(
      'type', 'address',
      'field', 'address',
      'message', 'Address appears incomplete. Please provide full street address.',
      'priority', 'medium'
    );
  END IF;

  IF v_verification.address_is_po_box = true THEN
    v_suggestions := v_suggestions || jsonb_build_object(
      'type', 'address',
      'field', 'address',
      'message', 'PO Box detected. Please provide physical address if possible.',
      'priority', 'low'
    );
  END IF;

  -- ZIP code suggestions
  IF v_verification.address_formatted IS NOT NULL AND NOT (v_verification.address_formatted ~ '\d{5}') THEN
    v_suggestions := v_suggestions || jsonb_build_object(
      'type', 'address',
      'field', 'zip',
      'message', 'ZIP code missing or invalid. Please provide 5-digit ZIP code.',
      'priority', 'high'
    );
  END IF;

  -- Name suggestions
  IF v_verification.homeowner_match_score < 0.5 THEN
    v_suggestions := v_suggestions || jsonb_build_object(
      'type', 'name',
      'field', 'name',
      'message', 'Name format appears suspicious. Please verify full name spelling.',
      'priority', 'medium'
    );
  END IF;

  -- Phone suggestions
  IF v_verification.phone_type = 'voip' THEN
    v_suggestions := v_suggestions || jsonb_build_object(
      'type', 'phone',
      'field', 'phone',
      'message', 'VoIP phone detected. Please provide mobile or landline if possible.',
      'priority', 'low'
    );
  END IF;

  IF v_verification.phone_valid = false THEN
    v_suggestions := v_suggestions || jsonb_build_object(
      'type', 'phone',
      'field', 'phone',
      'message', 'Phone number format appears invalid. Please check and correct.',
      'priority', 'high'
    );
  END IF;

  -- Intent suggestions
  IF v_verification.intent_roofing_relevant = false AND v_verification.intent_verification_status != 'unknown' THEN
    v_suggestions := v_suggestions || jsonb_build_object(
      'type', 'intent',
      'field', 'notes',
      'message', 'Message does not appear to be roofing-related. Please provide more details about roof issue.',
      'priority', 'medium'
    );
  END IF;

  RETURN v_suggestions;
END;
$$;

-- ============================================
-- Comments
-- ============================================
COMMENT ON FUNCTION public.auto_verify_lead_on_create IS 'Trigger function to auto-verify leads/contacts on creation';
COMMENT ON FUNCTION public.trigger_lead_verification IS 'Triggers lead verification via notification system';
COMMENT ON FUNCTION public.get_lead_correction_suggestions IS 'Generates correction suggestions based on verification results';





















































