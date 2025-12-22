-- =========================================================
-- Block 21717 — SmartSend Roofing Follow-Up Brain DEMO MODE v1
-- (So you can demo SmartSend to roofers TODAY even with zero real contacts.)
-- =========================================================
-- 
-- This block gives SmartSend a sandbox campaign with:
-- - Fake homeowners
-- - Fake outbound emails
-- - Fake follow-ups
-- - Fake replies (warm + hot + not interested)
-- - A full working timeline, metrics, auto-replies, status changes
-- 
-- …so when you show a roofer SmartSend, you can say:
-- "Here's how SmartSend handles homeowners automatically for you — this is exactly what your dashboard will look like when sending real campaigns."
-- 
-- This is CRITICAL for closing early customers.

-- ============================================================================
-- 1. Add Demo Flag To Companies Table
-- ============================================================================
-- Each company can have its own independent demo seed.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS has_demo_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_has_demo_data 
  ON public.companies(has_demo_data) 
  WHERE has_demo_data = true;

-- ============================================================================
-- 2. DEMO SEED FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_demo_follow_up_data(
  p_company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign_id uuid;
  v_contacts uuid[];
  v_profile uuid;
  v_contact uuid;
  v_name text[];
  v_email text[];
  v_city text := 'Springfield';
  v_now timestamptz := now();
  v_workspace_id uuid;
  v_inbound_id uuid;
  i int := 1;
BEGIN
  -- Get workspace_id from company (companies table uses workspace_id)
  SELECT workspace_id INTO v_workspace_id
  FROM public.companies
  WHERE id = p_company_id
  LIMIT 1;

  -- If company not found, try using p_company_id as workspace_id directly
  IF v_workspace_id IS NULL THEN
    v_workspace_id := p_company_id;
  END IF;

  -- 1. Create the demo campaign
  INSERT INTO public.campaigns (
    workspace_id,
    name,
    description,
    status
  )
  VALUES (
    v_workspace_id,
    'Demo Campaign — Roofing Follow-Up Sandbox',
    'This sandbox shows how SmartSend automatically follows up, responds, and classifies homeowner replies.',
    'active'
  )
  RETURNING id INTO v_campaign_id;

  -- 2. Create default follow-up settings
  INSERT INTO public.campaign_follow_up_settings (
    company_id,
    campaign_id,
    enabled,
    max_follow_ups,
    fu_1_delay_hours,
    fu_2_delay_hours,
    fu_3_delay_hours,
    fu_4_delay_hours,
    stop_on_reply,
    auto_send_warm,
    auto_send_hot
  )
  VALUES (
    p_company_id,
    v_campaign_id,
    true,
    4,
    48,
    96,
    168,
    336,
    true,
    true,
    true
  )
  ON CONFLICT (campaign_id) DO NOTHING;

  -- 3. Fake contacts
  v_name := ARRAY['Sarah M', 'Jacob P', 'Kim L', 'Alice T', 'Tom R'];
  v_email := ARRAY[
    'sarahm@example.com',
    'jacobp@example.com',
    'kiml@example.com',
    'alicet@example.com',
    'tomr@example.com'
  ];

  v_contacts := ARRAY[]::uuid[];

  FOR i IN 1..5 LOOP
    INSERT INTO public.contacts (
      workspace_id,
      first_name,
      email,
      city
    )
    VALUES (
      v_workspace_id,
      v_name[i],
      v_email[i],
      v_city
    )
    ON CONFLICT (workspace_id, lower(email)) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        city = EXCLUDED.city
    RETURNING id INTO v_contact;

    v_contacts := array_append(v_contacts, v_contact);
  END LOOP;

  -- 4. Create follow-up profiles + fake events for each contact
  FOR i IN 1..5 LOOP
    v_contact := v_contacts[i];

    -- Get or create follow-up profile
    SELECT id INTO v_profile
    FROM public.follow_up_profiles
    WHERE campaign_id = v_campaign_id AND contact_id = v_contact;

    IF v_profile IS NULL THEN
      INSERT INTO public.follow_up_profiles (
        company_id,
        campaign_id,
        contact_id,
        initial_email_id,
        current_stage,
        status,
        created_at,
        updated_at
      )
      VALUES (
        p_company_id,
        v_campaign_id,
        v_contact,
        gen_random_uuid(), -- fake initial email
        'fu_3',            -- assume most reached FU3
        'active',
        v_now - interval '3 days',
        v_now - interval '1 day'
      )
      RETURNING id INTO v_profile;
    ELSE
      UPDATE public.follow_up_profiles
      SET current_stage = 'fu_3',
          status = 'active',
          updated_at = v_now - interval '1 day'
      WHERE id = v_profile;
    END IF;

    -- Fake outbound sends (insert only if they don't exist)
    INSERT INTO public.email_send_queue (
      company_id, campaign_id, contact_id,
      follow_up_profile_id, follow_up_stage,
      to_email, subject, body, status, scheduled_at, sent_at
    )
    SELECT
      p_company_id, v_campaign_id, v_contact, v_profile, null::follow_up_stage,
      v_email[i], 'Roof inspection', 'Initial outreach', 'sent'::email_job_status, v_now - interval '3 days', v_now - interval '3 days'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.email_send_queue
      WHERE campaign_id = v_campaign_id AND contact_id = v_contact AND follow_up_stage IS NULL
    );

    INSERT INTO public.email_send_queue (
      company_id, campaign_id, contact_id,
      follow_up_profile_id, follow_up_stage,
      to_email, subject, body, status, scheduled_at, sent_at
    )
    SELECT
      p_company_id, v_campaign_id, v_contact, v_profile, 'fu_1'::follow_up_stage,
      v_email[i], 'Quick follow-up', 'Follow-up 1', 'sent'::email_job_status, v_now - interval '2 days', v_now - interval '2 days'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.email_send_queue
      WHERE campaign_id = v_campaign_id AND contact_id = v_contact AND follow_up_stage = 'fu_1'
    );

    INSERT INTO public.email_send_queue (
      company_id, campaign_id, contact_id,
      follow_up_profile_id, follow_up_stage,
      to_email, subject, body, status, scheduled_at, sent_at
    )
    SELECT
      p_company_id, v_campaign_id, v_contact, v_profile, 'fu_2'::follow_up_stage,
      v_email[i], 'Still need help?', 'Follow-up 2', 'sent'::email_job_status, v_now - interval '1 day', v_now - interval '1 day'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.email_send_queue
      WHERE campaign_id = v_campaign_id AND contact_id = v_contact AND follow_up_stage = 'fu_2'
    );

    -- Fake scenarios
    IF i = 1 THEN
      -- Sarah – HOT LEAD
      INSERT INTO public.inbound_emails (
        company_id, campaign_id, contact_id,
        from_email, to_email, subject, text_body, received_at
      )
      VALUES (
        p_company_id, v_campaign_id, v_contact,
        v_email[i], 'roofer@example.com', 'Re: Still need help?',
        'Yes, can you come out tomorrow?',
        v_now - interval '6 hours'
      )
      RETURNING id INTO v_inbound_id;

      UPDATE public.follow_up_profiles
      SET
        status = 'stopped_by_reply',
        lead_intent = 'hot',
        last_inbound_at = v_now - interval '6 hours',
        last_inbound_email_id = v_inbound_id
      WHERE id = v_profile;

      INSERT INTO public.follow_up_logs (
        follow_up_profile_id, company_id, campaign_id, contact_id,
        action, notes, created_at
      )
      SELECT
        v_profile, p_company_id, v_campaign_id, v_contact,
        'auto_reply_hot', 'Auto-reply sent to hot lead',
        v_now - interval '5 hours'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.follow_up_logs
        WHERE follow_up_profile_id = v_profile AND action = 'auto_reply_hot'
      );

    ELSIF i = 2 THEN
      -- Jacob – WARM LEAD
      INSERT INTO public.inbound_emails (
        company_id, campaign_id, contact_id,
        from_email, to_email, subject, text_body, received_at
      )
      VALUES (
        p_company_id, v_campaign_id, v_contact,
        v_email[i], 'roofer@example.com', 'More info?',
        'Can you send me pricing?',
        v_now - interval '12 hours'
      )
      RETURNING id INTO v_inbound_id;

      UPDATE public.follow_up_profiles
      SET
        status = 'stopped_by_reply',
        lead_intent = 'warm',
        last_inbound_at = v_now - interval '12 hours',
        last_inbound_email_id = v_inbound_id
      WHERE id = v_profile;

    ELSIF i = 3 THEN
      -- Kim – NO REPLY YET
      NULL; -- Keep as active, no reply

    ELSIF i = 4 THEN
      -- Alice – COLD
      UPDATE public.follow_up_profiles
      SET
        current_stage = 'fu_4',
        status = 'cold'
      WHERE id = v_profile;

      INSERT INTO public.follow_up_logs (
        follow_up_profile_id, company_id, campaign_id, contact_id,
        action, notes, created_at
      )
      SELECT
        v_profile, p_company_id, v_campaign_id, v_contact,
        'marked_cold', 'No reply after full follow-up sequence',
        v_now - interval '1 hour'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.follow_up_logs
        WHERE follow_up_profile_id = v_profile AND action = 'marked_cold'
      );

    ELSE
      -- Tom – NOT INTERESTED
      INSERT INTO public.inbound_emails (
        company_id, campaign_id, contact_id,
        from_email, to_email, subject, text_body, received_at
      )
      VALUES (
        p_company_id, v_campaign_id, v_contact,
        v_email[i], 'roofer@example.com', 'Remove me',
        'Not interested, thanks.',
        v_now - interval '4 hours'
      )
      RETURNING id INTO v_inbound_id;

      UPDATE public.follow_up_profiles
      SET
        status = 'stopped_by_reply',
        lead_intent = 'not_interested',
        last_inbound_at = v_now - interval '4 hours',
        last_inbound_email_id = v_inbound_id
      WHERE id = v_profile;
    END IF;

  END LOOP;

  -- Mark demo created
  UPDATE public.companies
  SET has_demo_data = true
  WHERE id = p_company_id;

  -- If company not found, try to create/update a company record
  IF NOT FOUND THEN
    -- Try to insert/update using workspace_id as company_id
    INSERT INTO public.companies (id, workspace_id, domain, name, has_demo_data)
    VALUES (p_company_id, v_workspace_id, 'demo.example.com', 'Demo Company', true)
    ON CONFLICT (workspace_id, domain) DO UPDATE
    SET has_demo_data = true;
  END IF;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.seed_demo_follow_up_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_follow_up_data(uuid) TO service_role;

-- ============================================================================
-- 3. Trigger Demo Seed on Company Creation (Optional)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_company_seed_demo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only seed if explicitly requested (you can add a flag if needed)
  -- For now, we'll skip auto-seeding to avoid cluttering
  -- Uncomment the line below if you want auto-seeding:
  -- PERFORM public.seed_demo_follow_up_data(new.id);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_seed_demo ON public.companies;

-- Uncomment to enable auto-seeding on company creation:
-- CREATE TRIGGER trg_company_seed_demo
-- AFTER INSERT ON public.companies
-- FOR EACH ROW
-- EXECUTE FUNCTION public.trg_company_seed_demo();

-- Comments
COMMENT ON FUNCTION public.seed_demo_follow_up_data IS 'Block 21717: Seeds demo follow-up data for a company/workspace - creates fake contacts, campaign, emails, and replies for demo purposes';
COMMENT ON COLUMN public.companies.has_demo_data IS 'Block 21717: Flag indicating if demo data has been seeded for this company';

