-- =========================================================
-- Block 17400 — Insurance-Specific Follow-Up Sequences
-- Seeds insurance follow-up templates for each timeline stage
-- =========================================================

-- ============================================================================
-- 1. SEED INSURANCE FOLLOW-UP TEMPLATES
-- ============================================================================

-- Sequence 1: Claim Filed
INSERT INTO public.followup_templates (
  workspace_id,
  template_type,
  name,
  subject,
  body,
  is_default,
  is_active
)
SELECT 
  id,
  'insurance',
  'Insurance – Claim Filed',
  'We''re here to help with your insurance claim',
  'Hi {{first_name}},

I saw that you''ve filed an insurance claim for your roof damage. That''s a smart move - insurance claims can be complex, and having the right contractor on your side makes all the difference.

Here''s what to expect in the process:

1. **Adjuster Meeting** - Your insurance adjuster will inspect the damage (usually within 7-14 days)
2. **Scope of Loss** - You''ll receive a document outlining what''s covered
3. **Approval** - Once approved, we can schedule the work

I''d love to help you through this process. Would you like me to:
- Attend the adjuster meeting with you?
- Review your scope of loss when you receive it?
- Answer any questions about the process?

Let me know what works best for you!

Best,
{{roofer_name}}',
  true,
  true
FROM public.workspaces
ON CONFLICT DO NOTHING;

-- Sequence 2: Adjuster Scheduled
INSERT INTO public.followup_templates (
  workspace_id,
  template_type,
  name,
  subject,
  body,
  is_default,
  is_active
)
SELECT 
  id,
  'insurance',
  'Insurance – Adjuster Scheduled',
  'Preparing for your adjuster meeting',
  'Hi {{first_name}},

I heard your adjuster meeting is scheduled for {{adjuster_meeting_date}}. Great news!

Before the adjuster arrives, here are a few things that can help ensure you get full coverage:

**What to Prepare:**
- Photos of all damage (roof, gutters, soft metals, interior leaks if any)
- Any documentation you have about the storm
- Notes about specific areas of concern

**What to Expect:**
- The adjuster will inspect your roof
- They''ll take measurements and photos
- You''ll receive a "scope of loss" document afterward

**Pro Tip:** I can attend the meeting with you to help point out damage and ensure nothing is missed. Many homeowners find this helpful.

Would you like me to be there? I''m happy to help make sure everything is properly documented.

Best,
{{roofer_name}}',
  true,
  true
FROM public.workspaces
ON CONFLICT DO NOTHING;

-- Sequence 3: Scope Received
INSERT INTO public.followup_templates (
  workspace_id,
  template_type,
  name,
  subject,
  body,
  is_default,
  is_active
)
SELECT 
  id,
  'insurance',
  'Insurance – Scope Received',
  'Let''s review your scope of loss together',
  'Hi {{first_name}},

I see you received your scope of loss from the insurance company. This is a critical document - it determines what''s covered and how much you''ll receive.

I''d love to review it with you to make sure:
- All damage is properly documented
- Nothing was missed
- The pricing is fair

**Common Issues We Find:**
- Missing line items (gutters, flashing, vents)
- Underestimated quantities
- Missing code upgrades

If we find any issues, we can submit a "supplement" to get you additional coverage. This is completely normal and often results in thousands more in coverage.

Would you like to send me a copy of your scope? I can review it free of charge and let you know if there are any opportunities for additional coverage.

Best,
{{roofer_name}}',
  true,
  true
FROM public.workspaces
ON CONFLICT DO NOTHING;

-- Sequence 4: Pending Approval
INSERT INTO public.followup_templates (
  workspace_id,
  template_type,
  name,
  subject,
  body,
  is_default,
  is_active
)
SELECT 
  id,
  'insurance',
  'Insurance – Pending Approval',
  'Checking in on your claim status',
  'Hi {{first_name}},

Just wanted to check in on your insurance claim. I know waiting for approval can be stressful, especially when you have roof damage that needs attention.

**Typical Timeline:**
- Initial approval: 7-14 days after scope received
- If supplement submitted: Additional 7-14 days

Have you heard anything from your insurance company yet? If it''s been more than 14 days, it might be worth giving them a call to check the status.

I''m here if you need any help navigating this or have questions. Once you get approval, we can move forward with scheduling your roof replacement.

Let me know if there''s anything I can help with!

Best,
{{roofer_name}}',
  true,
  true
FROM public.workspaces
ON CONFLICT DO NOTHING;

-- Sequence 5: Approved
INSERT INTO public.followup_templates (
  workspace_id,
  template_type,
  name,
  subject,
  body,
  is_default,
  is_active
)
SELECT 
  id,
  'insurance',
  'Insurance – Approved',
  'Congratulations! Your claim was approved',
  'Hi {{first_name}},

Fantastic news! I heard your insurance claim was approved. That''s a huge relief, and now we can move forward with getting your roof replaced.

**Next Steps:**
1. Review your approval letter and check amount
2. Schedule your roof replacement (we can work around your timeline)
3. Coordinate with your insurance company for payment

I''d love to help you schedule the work. Here''s my availability calendar: {{scheduling_link}}

Or if you prefer, just reply with dates that work for you and I''ll make it happen.

**What to Expect:**
- Most roof replacements take 1-2 days
- We''ll handle all permits and coordination
- You''ll get a beautiful, durable new roof

Let''s get this scheduled! I''m excited to help you get your roof replaced.

Best,
{{roofer_name}}',
  true,
  true
FROM public.workspaces
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. FUNCTION: Get Insurance Follow-Up Template by Stage
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_insurance_followup_template(
  p_workspace_id uuid,
  p_timeline_stage text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_template_name text;
  v_template jsonb;
BEGIN
  -- Map timeline stage to template name
  CASE p_timeline_stage
    WHEN 'claim_filed' THEN
      v_template_name := 'Insurance – Claim Filed';
    WHEN 'adjuster_scheduled' THEN
      v_template_name := 'Insurance – Adjuster Scheduled';
    WHEN 'scope_received' THEN
      v_template_name := 'Insurance – Scope Received';
    WHEN 'pending_approval' THEN
      v_template_name := 'Insurance – Pending Approval';
    WHEN 'approved' THEN
      v_template_name := 'Insurance – Approved';
    ELSE
      v_template_name := 'Insurance – Claim Filed'; -- Default
  END CASE;
  
  -- Get template
  SELECT jsonb_build_object(
    'id', id,
    'name', name,
    'subject', subject,
    'body', body,
    'template_type', template_type
  )
  INTO v_template
  FROM public.followup_templates
  WHERE workspace_id = p_workspace_id
    AND name = v_template_name
    AND is_active = true
  ORDER BY is_default DESC, created_at DESC
  LIMIT 1;
  
  RETURN COALESCE(v_template, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_insurance_followup_template IS 'Returns the appropriate insurance follow-up template based on timeline stage';

-- ============================================================================
-- 3. FUNCTION: Schedule Insurance Follow-Up Based on Timeline Stage
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_insurance_followup(
  p_contact_id uuid,
  p_timeline_stage text,
  p_send_in_days integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_template jsonb;
  v_next_followup_at timestamptz;
  v_followup_id uuid;
BEGIN
  -- Get contact
  SELECT * INTO v_contact
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  -- Get template
  v_template := public.get_insurance_followup_template(
    v_contact.workspace_id,
    p_timeline_stage
  );
  
  IF v_template = '{}'::jsonb THEN
    RETURN jsonb_build_object('error', 'Template not found');
  END IF;
  
  -- Calculate next follow-up time
  v_next_followup_at := now() + (p_send_in_days || ' days')::interval;
  
  -- Cancel existing pending follow-ups for this contact
  UPDATE public.followup_schedule
  SET status = 'cancelled'
  WHERE contact_id = p_contact_id
    AND status = 'pending';
  
  -- Create new follow-up schedule
  INSERT INTO public.followup_schedule (
    contact_id,
    workspace_id,
    next_followup_at,
    followup_step,
    template_type,
    tone,
    reason,
    metadata
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    v_next_followup_at,
    1,
    'insurance',
    'insurance',
    format('insurance_timeline_stage_%s', p_timeline_stage),
    jsonb_build_object(
      'timeline_stage', p_timeline_stage,
      'template_id', v_template->>'id',
      'template_name', v_template->>'name'
    )
  )
  RETURNING id INTO v_followup_id;
  
  RETURN jsonb_build_object(
    'ok', true,
    'followup_id', v_followup_id,
    'scheduled_for', v_next_followup_at,
    'template', v_template
  );
END;
$$;

COMMENT ON FUNCTION public.schedule_insurance_followup IS 'Schedules an insurance-specific follow-up based on timeline stage';

-- ============================================================================
-- 4. TRIGGER: Auto-schedule follow-up when timeline stage changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_insurance_followup_on_timeline_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days_until_followup integer;
BEGIN
  -- Only trigger on stage changes
  IF OLD.stage = NEW.stage THEN
    RETURN NEW;
  END IF;
  
  -- Determine days until follow-up based on stage
  CASE NEW.stage
    WHEN 'claim_filed' THEN
      v_days_until_followup := 1; -- Send next day
    WHEN 'adjuster_scheduled' THEN
      v_days_until_followup := 1; -- Send next day
    WHEN 'scope_received' THEN
      v_days_until_followup := 1; -- Send next day
    WHEN 'pending_approval' THEN
      v_days_until_followup := 7; -- Weekly check-ins
    WHEN 'approved' THEN
      v_days_until_followup := 1; -- Send next day
    ELSE
      v_days_until_followup := 1; -- Default
  END CASE;
  
  -- Schedule follow-up
  BEGIN
    PERFORM public.schedule_insurance_followup(
      NEW.contact_id,
      NEW.stage,
      v_days_until_followup
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the update
    RAISE WARNING 'Error scheduling insurance follow-up for contact %: %', NEW.contact_id, SQLERRM;
  END;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_insurance_followup_on_timeline_update ON public.insurance_timeline;
CREATE TRIGGER trg_insurance_followup_on_timeline_update
  AFTER UPDATE ON public.insurance_timeline
  FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.trigger_insurance_followup_on_timeline_update();

-- ============================================================================
-- 5. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_insurance_followup_template(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_insurance_followup(uuid, text, integer) TO service_role;

