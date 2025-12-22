-- =========================================================
-- Block 26280 — SmartSend Roofing Collections Email Playbooks v1
-- (Done-for-you invoice follow-up sequences • Homeowner + Insurance adjuster templates • Soft → Firm → Final escalation ladder)
-- =========================================================
-- 
-- This block gives SmartSend elite collections automation that roofing companies NEVER want to write themselves.
-- 
-- You give them professional, proven sequences that get people to PAY — without sounding aggressive or sloppy.
-- 
-- This becomes a massive value-add because roofers suck at collecting money.

-- ============================================================================
-- PART 1 — COLLECTIONS PLAYBOOK TABLE (SUPABASE SQL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_collections_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  payer_type text CHECK (payer_type IN ('homeowner', 'insurance')) NOT NULL,
  level text CHECK (level IN ('soft', 'professional', 'firm', 'final')) NOT NULL,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_collections_playbooks_payer_level 
  ON public.roofing_collections_playbooks(payer_type, level);
CREATE INDEX IF NOT EXISTS idx_collections_playbooks_level 
  ON public.roofing_collections_playbooks(level);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.roofing_collections_playbooks_update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_collections_playbooks_updated_at ON public.roofing_collections_playbooks;
CREATE TRIGGER trg_collections_playbooks_updated_at
BEFORE UPDATE ON public.roofing_collections_playbooks
FOR EACH ROW
EXECUTE FUNCTION public.roofing_collections_playbooks_update_updated_at();

-- ============================================================================
-- PART 2 — DEFAULT PLAYBOOK INSERTS (THE MAGIC SAUCE)
-- ============================================================================
-- These are the pre-loaded SmartSend email templates for roofers.

-- 1️⃣ HOMEOWNER — Soft Reminder
INSERT INTO public.roofing_collections_playbooks
(name, payer_type, level, subject_template, body_template)
VALUES (
  'Homeowner - Soft Reminder',
  'homeowner',
  'soft',
  'Quick Roofing Project Payment Reminder',
  'Hi {{name}},

Hope you''re doing well! This is a quick reminder about the remaining balance for your roofing project.

Remaining balance: ${{balance}}
Due date: {{due_date}}

If you''ve already sent this in, please disregard — otherwise you can reply here with any questions.

Thank you!'
);

-- 2️⃣ HOMEOWNER — Professional Follow-up
INSERT INTO public.roofing_collections_playbooks
(name, payer_type, level, subject_template, body_template)
VALUES (
  'Homeowner - Professional Follow-up',
  'homeowner',
  'professional',
  'Payment Reminder for Roofing Project (Invoice {{invoice_number}})',
  'Hi {{name}},

This is a follow-up regarding the outstanding balance for your roofing project.

Invoice total: ${{invoice_amount}}
Amount paid: ${{amount_paid}}
Remaining balance: ${{balance}}
Due date: {{due_date}}

Please make arrangements to complete this payment. If you need a new copy of your invoice or have questions, feel free to reply here.

Thank you!'
);

-- 3️⃣ HOMEOWNER — Firm Reminder
INSERT INTO public.roofing_collections_playbooks
(name, payer_type, level, subject_template, body_template)
VALUES (
  'Homeowner - Firm Reminder',
  'homeowner',
  'firm',
  'Urgent: Past Due Roofing Invoice {{invoice_number}}',
  'Hi {{name}},

Your roofing invoice is now past due.

Remaining balance: ${{balance}}
Original due date: {{due_date}}

Please complete payment as soon as possible to avoid further delays or additional steps in the collections process.

If you need help, respond to this email immediately.

Thank you.'
);

-- 4️⃣ HOMEOWNER — Final Attempt
INSERT INTO public.roofing_collections_playbooks
(name, payer_type, level, subject_template, body_template)
VALUES (
  'Homeowner - Final Attempt',
  'homeowner',
  'final',
  'Final Notice: Immediate Payment Required (Invoice {{invoice_number}})',
  'Hi {{name}},

This is our final notice regarding the past due balance for your roofing project.

Remaining balance: ${{balance}}

If we do not receive payment or communication within 48 hours, we may need to escalate this matter. Please reply to confirm payment arrangements.

We prefer to resolve this quickly and professionally.

Thank you.'
);

-- ============================================================================
-- PART 3 — INSURANCE COMPANY PLAYBOOKS
-- ============================================================================

-- 1️⃣ INSURANCE — ACV Check Reminder
INSERT INTO public.roofing_collections_playbooks
(name, payer_type, level, subject_template, body_template)
VALUES (
  'Insurance - ACV Check Reminder',
  'insurance',
  'soft',
  'Request for ACV Check – Claim {{claim_number}}',
  'Hello,

Following up regarding the ACV payment for claim {{claim_number}}.

This payment is needed so we can proceed with the roofing project. Please confirm status or expected release date.

Thank you.'
);

-- 2️⃣ INSURANCE — Depreciation Release
INSERT INTO public.roofing_collections_playbooks
(name, payer_type, level, subject_template, body_template)
VALUES (
  'Insurance - Depreciation Release Request',
  'insurance',
  'professional',
  'Depreciation Request – Claim {{claim_number}}',
  'Hello,

Requesting the release of recoverable depreciation for claim {{claim_number}}.

All required documentation has been submitted, and the roof replacement is complete.

Please confirm release timing.

Thank you.'
);

-- 3️⃣ INSURANCE — Firm Follow-Up
INSERT INTO public.roofing_collections_playbooks
(name, payer_type, level, subject_template, body_template)
VALUES (
  'Insurance - Firm Depreciation Follow-Up',
  'insurance',
  'firm',
  'Second Request: Depreciation Release (Claim {{claim_number}})',
  'Hello,

This is a second request for the release of recoverable depreciation for claim {{claim_number}}.

Please advise us on the status or any missing documents needed to complete payment.

Thank you.'
);

-- 4️⃣ INSURANCE — Final Attempt
INSERT INTO public.roofing_collections_playbooks
(name, payer_type, level, subject_template, body_template)
VALUES (
  'Insurance - Final Payment Demand',
  'insurance',
  'final',
  'Final Payment Request – Claim {{claim_number}}',
  'Hello,

This is our final request for the release of remaining funds for claim {{claim_number}}.

We require confirmation within 48 hours. If additional documentation is needed, please notify us immediately.

Thank you.'
);

-- ============================================================================
-- PART 4 — COLLECTION REMINDERS TRACKING TABLE
-- ============================================================================
-- Track which reminders have been sent to prevent duplicates

CREATE TABLE IF NOT EXISTS public.roofing_collection_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.roofing_invoices(id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES public.roofing_collections_playbooks(id),
  level text NOT NULL CHECK (level IN ('soft', 'professional', 'firm', 'final')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  scheduled_send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled')),
  send_queue_id uuid, -- references send_queue(id) if queued
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_collection_reminders_invoice 
  ON public.roofing_collection_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_collection_reminders_scheduled 
  ON public.roofing_collection_reminders(scheduled_send_at) 
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_collection_reminders_level 
  ON public.roofing_collection_reminders(invoice_id, level);

-- ============================================================================
-- PART 5 — AUTOMATIC SEQUENCE SELECTION FUNCTION
-- ============================================================================
-- SmartSend picks the correct tone level based on:
-- - Days overdue
-- - Payment stage
-- - Check stage
-- - Past reminders sent

CREATE OR REPLACE FUNCTION public.select_collections_playbook(
  p_invoice_id uuid,
  p_days_overdue integer DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_invoice_record RECORD;
  v_days_overdue integer;
  v_last_level text;
  v_playbook_id uuid;
BEGIN
  -- Get invoice details
  SELECT 
    i.*,
    ib.balance_due,
    i.due_date,
    CASE 
      WHEN i.due_date IS NULL THEN 0
      ELSE GREATEST(0, CURRENT_DATE - i.due_date)
    END as calculated_days_overdue
  INTO v_invoice_record
  FROM public.roofing_invoices i
  LEFT JOIN public.roofing_invoice_balances ib ON ib.invoice_id = i.id
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Use provided days_overdue or calculate
  v_days_overdue := COALESCE(p_days_overdue, v_invoice_record.calculated_days_overdue);

  -- Get the highest level reminder already sent
  SELECT MAX(level) INTO v_last_level
  FROM public.roofing_collection_reminders
  WHERE invoice_id = p_invoice_id
    AND status = 'sent';

  -- Determine level based on days overdue and previous reminders
  -- Logic hierarchy:
  -- if (!overdue) level = "soft";
  -- else if (1–7 days overdue) level = "professional";
  -- else if (8–15 days overdue) level = "firm";
  -- else level = "final";
  
  -- But if we've already sent a higher level, don't go backwards
  DECLARE
    v_target_level text;
  BEGIN
    IF v_days_overdue <= 0 THEN
      v_target_level := 'soft';
    ELSIF v_days_overdue <= 7 THEN
      v_target_level := 'professional';
    ELSIF v_days_overdue <= 15 THEN
      v_target_level := 'firm';
    ELSE
      v_target_level := 'final';
    END IF;

    -- Don't downgrade if we've already sent a higher level
    IF v_last_level IS NOT NULL THEN
      CASE v_last_level
        WHEN 'final' THEN v_target_level := 'final';
        WHEN 'firm' THEN v_target_level := CASE WHEN v_target_level = 'final' THEN 'final' ELSE 'firm' END;
        WHEN 'professional' THEN v_target_level := CASE WHEN v_target_level IN ('final', 'firm') THEN v_target_level ELSE 'professional' END;
        WHEN 'soft' THEN NULL; -- Can upgrade from soft
      END CASE;
    END IF;

    -- Get the playbook for this payer_type and level
    SELECT id INTO v_playbook_id
    FROM public.roofing_collections_playbooks
    WHERE payer_type = v_invoice_record.payer_type
      AND level = v_target_level
    LIMIT 1;

    RETURN v_playbook_id;
  END;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.select_collections_playbook IS 'Selects the appropriate collections playbook based on invoice overdue status and previous reminders sent';

-- ============================================================================
-- PART 6 — TEMPLATE RENDERING FUNCTION
-- ============================================================================
-- Renders template variables like {{name}}, {{balance}}, etc.

CREATE OR REPLACE FUNCTION public.render_collections_template(
  p_template text,
  p_invoice_id uuid
)
RETURNS text AS $$
DECLARE
  v_invoice_record RECORD;
  v_rendered text;
BEGIN
  -- Get invoice and balance data
  SELECT 
    i.*,
    ib.balance_due,
    ib.invoice_amount,
    ib.amount_paid,
    COALESCE(ib.balance_due, i.amount) as balance
  INTO v_invoice_record
  FROM public.roofing_invoices i
  LEFT JOIN public.roofing_invoice_balances ib ON ib.invoice_id = i.id
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN p_template; -- Return template as-is if invoice not found
  END IF;

  -- Render template variables
  v_rendered := p_template;
  
  -- Replace variables
  v_rendered := REPLACE(v_rendered, '{{name}}', COALESCE(v_invoice_record.payer_name, 'Valued Customer'));
  v_rendered := REPLACE(v_rendered, '{{balance}}', COALESCE(TO_CHAR(v_invoice_record.balance, 'FM$999,999,999.00'), '$0.00'));
  v_rendered := REPLACE(v_rendered, '{{invoice_number}}', COALESCE(v_invoice_record.invoice_number, 'N/A'));
  v_rendered := REPLACE(v_rendered, '{{invoice_amount}}', COALESCE(TO_CHAR(v_invoice_record.invoice_amount, 'FM$999,999,999.00'), '$0.00'));
  v_rendered := REPLACE(v_rendered, '{{amount_paid}}', COALESCE(TO_CHAR(v_invoice_record.amount_paid, 'FM$999,999,999.00'), '$0.00'));
  v_rendered := REPLACE(v_rendered, '{{due_date}}', COALESCE(TO_CHAR(v_invoice_record.due_date, 'MM/DD/YYYY'), 'N/A'));
  v_rendered := REPLACE(v_rendered, '{{claim_number}}', COALESCE(v_invoice_record.claim_number, 'N/A'));

  RETURN v_rendered;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.render_collections_template IS 'Renders collections email template with invoice variables';

-- ============================================================================
-- PART 7 — QUEUE COLLECTION EMAIL FUNCTION
-- ============================================================================
-- Queues a collection email to send_queue

CREATE OR REPLACE FUNCTION public.queue_collections_email(
  p_invoice_id uuid,
  p_playbook_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_invoice_record RECORD;
  v_playbook_record RECORD;
  v_selected_playbook_id uuid;
  v_subject text;
  v_body text;
  v_workspace_id uuid;
  v_campaign_id uuid;
  v_lead_id uuid;
  v_from_inbox_id uuid;
  v_queue_id uuid;
  v_reminder_id uuid;
  v_days_overdue integer;
BEGIN
  -- Get invoice details
  SELECT 
    i.*,
    ib.balance_due,
    CASE 
      WHEN i.due_date IS NULL THEN 0
      ELSE GREATEST(0, CURRENT_DATE - i.due_date)
    END as calculated_days_overdue
  INTO v_invoice_record
  FROM public.roofing_invoices i
  LEFT JOIN public.roofing_invoice_balances ib ON ib.invoice_id = i.id
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  -- Check if balance is actually due
  IF COALESCE(v_invoice_record.balance_due, v_invoice_record.amount) <= 0 THEN
    RAISE EXCEPTION 'Invoice has no balance due';
  END IF;

  -- Check if payer_email exists
  IF v_invoice_record.payer_email IS NULL OR v_invoice_record.payer_email = '' THEN
    RAISE EXCEPTION 'Invoice has no payer email address';
  END IF;

  v_days_overdue := v_invoice_record.calculated_days_overdue;
  v_workspace_id := v_invoice_record.workspace_id;

  -- Select playbook if not provided
  IF p_playbook_id IS NULL THEN
    v_selected_playbook_id := public.select_collections_playbook(p_invoice_id, v_days_overdue);
  ELSE
    v_selected_playbook_id := p_playbook_id;
  END IF;

  IF v_selected_playbook_id IS NULL THEN
    RAISE EXCEPTION 'No playbook found for invoice';
  END IF;

  -- Get playbook details
  SELECT * INTO v_playbook_record
  FROM public.roofing_collections_playbooks
  WHERE id = v_selected_playbook_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playbook not found: %', v_selected_playbook_id;
  END IF;

  -- Render templates
  v_subject := public.render_collections_template(v_playbook_record.subject_template, p_invoice_id);
  v_body := public.render_collections_template(v_playbook_record.body_template, p_invoice_id);

  -- Get or create a "Collections" campaign for this workspace
  -- First try to find existing collections campaign
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE workspace_id = v_workspace_id
    AND name = 'Collections Campaign'
    AND status = 'active'
  LIMIT 1;

  -- If no collections campaign exists, we'll need to create one or use a system campaign
  -- For now, we'll use a placeholder - the API route will handle campaign creation
  -- Set to NULL and let the API route handle it
  v_campaign_id := NULL;

  -- Get or create lead/contact for payer
  -- Try to find existing contact by email
  SELECT id INTO v_lead_id
  FROM public.contacts
  WHERE email = v_invoice_record.payer_email
    AND workspace_id = v_workspace_id
  LIMIT 1;

  -- If no contact exists, we'll need to create one
  -- For now, set to NULL and let the API route handle contact creation
  v_lead_id := NULL;

  -- Get workspace default inbox
  SELECT id INTO v_from_inbox_id
  FROM public.inboxes
  WHERE workspace_id = v_workspace_id
    AND is_active = true
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1;

  -- If no inbox found, we can't send
  IF v_from_inbox_id IS NULL THEN
    RAISE EXCEPTION 'No active inbox found for workspace';
  END IF;

  -- Calculate scheduled send time (immediate for overdue, or based on level)
  DECLARE
    v_scheduled_at timestamptz;
  BEGIN
    -- For soft reminders, schedule for next business day morning (9 AM)
    -- For professional/firm/final, send immediately
    IF v_playbook_record.level = 'soft' THEN
      v_scheduled_at := (CURRENT_DATE + INTERVAL '1 day')::date + TIME '09:00:00';
      -- If it's already past 9 AM today, schedule for tomorrow
      IF CURRENT_TIME >= TIME '09:00:00' THEN
        v_scheduled_at := (CURRENT_DATE + INTERVAL '1 day')::date + TIME '09:00:00';
      ELSE
        v_scheduled_at := CURRENT_DATE + TIME '09:00:00';
      END IF;
    ELSE
      v_scheduled_at := now();
    END IF;

    -- Create reminder record first
    INSERT INTO public.roofing_collection_reminders (
      invoice_id,
      playbook_id,
      level,
      scheduled_send_at,
      status
    ) VALUES (
      p_invoice_id,
      v_selected_playbook_id,
      v_playbook_record.level,
      v_scheduled_at,
      'scheduled'
    ) RETURNING id INTO v_reminder_id;

    -- Note: We don't insert into send_queue here because we need campaign_id and lead_id
    -- The API route will handle that after creating/finding the campaign and contact
    -- Return the reminder_id so the API can complete the queue insertion

    RETURN v_reminder_id;
  END;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.queue_collections_email IS 'Queues a collections email for an invoice. Returns reminder_id. API route must complete send_queue insertion.';

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.roofing_collections_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_collection_reminders ENABLE ROW LEVEL SECURITY;

-- Playbooks: Read-only for authenticated users (they're system templates)
CREATE POLICY "collections_playbooks_read"
  ON public.roofing_collections_playbooks FOR SELECT
  TO authenticated
  USING (true);

-- Reminders: Users can view reminders for invoices in their workspace
CREATE POLICY "collection_reminders_read"
  ON public.roofing_collection_reminders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_invoices i
      JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id
      WHERE i.id = roofing_collection_reminders.invoice_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service role has full access
CREATE POLICY "collections_playbooks_service_role"
  ON public.roofing_collections_playbooks FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "collection_reminders_service_role"
  ON public.roofing_collection_reminders FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.roofing_collections_playbooks TO authenticated;
GRANT SELECT ON public.roofing_collection_reminders TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_collections_playbook(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.render_collections_template(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.queue_collections_email(uuid, uuid) TO authenticated, service_role;

COMMENT ON TABLE public.roofing_collections_playbooks IS 'Block 26280: Collections email templates for roofing invoices';
COMMENT ON TABLE public.roofing_collection_reminders IS 'Block 26280: Tracks sent collection reminders to prevent duplicates and manage escalation';



































