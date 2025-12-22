-- =========================================================
-- Block 24540 — SmartSend Roofing Review & Referral Engine v1
-- (Automated Review Requests • Referral Generation • Job Completion Flows)
-- =========================================================
-- 
-- THIS BLOCK TRANSFORMS SMARTSEND INTO A GROWTH MULTIPLIER.
-- Every completed job becomes:
-- ✔ 5-star Google reviews
-- ✔ referrals from neighbors
-- ✔ repeat business
-- ✔ long-term homeowner trust
--
-- When a job hits "installed", SmartSend activates this engine.
-- =========================================================

-- ============================================================================
-- PART 1: CREATE ENUMS
-- ============================================================================

-- Review/referral sequence status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_referral_status') THEN
    CREATE TYPE review_referral_status AS ENUM (
      'active',           -- sequence is running
      'paused',           -- manually paused
      'completed',        -- all messages sent
      'cancelled',        -- cancelled due to negative response
      'stopped_by_reply'  -- homeowner replied and sequence stopped
    );
  END IF;
END $$;

-- Review/referral sequence phase
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_referral_phase') THEN
    CREATE TYPE review_referral_phase AS ENUM (
      'review_collection',      -- Phase 1: Asking for reviews
      'referral_generation',    -- Phase 2: Asking for referrals
      'long_term_relationship' -- Phase 3: Long-term check-ins
    );
  END IF;
END $$;

-- ============================================================================
-- PART 2: CREATE REVIEW LINKS TABLE
-- ============================================================================
-- Stores Google, Facebook, BBB review links per workspace

CREATE TABLE IF NOT EXISTS public.review_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('google', 'facebook', 'bbb')),
  review_url TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false, -- primary link to use
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_review_links_workspace ON public.review_links(workspace_id);
CREATE INDEX IF NOT EXISTS idx_review_links_primary ON public.review_links(workspace_id, is_primary) WHERE is_primary = true;

-- ============================================================================
-- PART 3: CREATE REVIEW & REFERRAL SEQUENCES TABLE
-- ============================================================================
-- Tracks which leads are enrolled in review/referral sequences

CREATE TABLE IF NOT EXISTS public.review_referral_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status review_referral_status NOT NULL DEFAULT 'active',
  current_phase review_referral_phase NOT NULL DEFAULT 'review_collection',
  current_step INTEGER NOT NULL DEFAULT 0, -- which message number in current phase
  installed_at TIMESTAMPTZ NOT NULL, -- when job was installed (trigger time)
  review_collection_started_at TIMESTAMPTZ,
  referral_generation_started_at TIMESTAMPTZ,
  long_term_started_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT, -- why sequence was cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_referral_sequences_lead ON public.review_referral_sequences(lead_id);
CREATE INDEX IF NOT EXISTS idx_review_referral_sequences_workspace ON public.review_referral_sequences(workspace_id);
CREATE INDEX IF NOT EXISTS idx_review_referral_sequences_status ON public.review_referral_sequences(status);
CREATE INDEX IF NOT EXISTS idx_review_referral_sequences_due ON public.review_referral_sequences(workspace_id, status, current_phase, current_step) WHERE status = 'active';

-- ============================================================================
-- PART 4: CREATE REVIEW & REFERRAL MESSAGES TABLE
-- ============================================================================
-- Stores scheduled messages for review/referral sequences

CREATE TABLE IF NOT EXISTS public.review_referral_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.review_referral_sequences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phase review_referral_phase NOT NULL,
  step_number INTEGER NOT NULL, -- 1, 2, 3 within the phase
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled', 'failed')),
  email_job_id UUID, -- link to email_jobs if sent
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_referral_messages_sequence ON public.review_referral_messages(sequence_id);
CREATE INDEX IF NOT EXISTS idx_review_referral_messages_lead ON public.review_referral_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_review_referral_messages_due ON public.review_referral_messages(workspace_id, status, scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_review_referral_messages_workspace ON public.review_referral_messages(workspace_id);

-- ============================================================================
-- PART 5: CREATE REVIEWS TRACKING TABLE
-- ============================================================================
-- Tracks when reviews are actually left (manual entry or API integration)

CREATE TABLE IF NOT EXISTS public.reviews_tracked (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  review_platform TEXT NOT NULL CHECK (review_platform IN ('google', 'facebook', 'bbb', 'other')),
  review_url TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_tracked_lead ON public.reviews_tracked(lead_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tracked_workspace ON public.reviews_tracked(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tracked_reviewed_at ON public.reviews_tracked(reviewed_at DESC);

-- ============================================================================
-- PART 6: CREATE REFERRALS TRACKING TABLE
-- ============================================================================
-- Tracks referrals generated from homeowners

CREATE TABLE IF NOT EXISTS public.referrals_tracked (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referring_lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE, -- homeowner who referred
  referred_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL, -- new lead from referral (if created)
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  referral_source TEXT CHECK (referral_source IN ('neighbor', 'family', 'friend', 'other')),
  referral_name TEXT,
  referral_email TEXT,
  referral_phone TEXT,
  referral_address TEXT,
  referral_city TEXT,
  referral_state TEXT,
  referral_zip TEXT,
  referral_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'quoted', 'booked', 'completed', 'lost')),
  reward_sent BOOLEAN NOT NULL DEFAULT false,
  reward_amount NUMERIC(10,2),
  reward_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_tracked_referring_lead ON public.referrals_tracked(referring_lead_id);
CREATE INDEX IF NOT EXISTS idx_referrals_tracked_referred_lead ON public.referrals_tracked(referred_lead_id);
CREATE INDEX IF NOT EXISTS idx_referrals_tracked_workspace ON public.referrals_tracked(workspace_id);
CREATE INDEX IF NOT EXISTS idx_referrals_tracked_status ON public.referrals_tracked(status);

-- ============================================================================
-- PART 7: CREATE NEGATIVE SENTIMENT DETECTION TABLE
-- ============================================================================
-- Tracks negative responses that trigger sequence cancellation

CREATE TABLE IF NOT EXISTS public.negative_sentiment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES public.review_referral_sequences(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL,
  sentiment_score NUMERIC(3,2), -- 0.0 to 1.0 (lower = more negative)
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action_taken TEXT NOT NULL DEFAULT 'sequence_cancelled', -- what action was taken
  roofer_notified BOOLEAN NOT NULL DEFAULT false,
  roofer_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_negative_sentiment_logs_lead ON public.negative_sentiment_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_negative_sentiment_logs_workspace ON public.negative_sentiment_logs(workspace_id);

-- ============================================================================
-- PART 8: CREATE EMAIL TEMPLATES FOR REVIEW & REFERRAL SEQUENCES
-- ============================================================================

-- Insert templates into email_templates table (if it exists)
DO $$
BEGIN
  -- Phase 1: Review Collection - Message 1 (Same Day)
  INSERT INTO public.email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'review_request_day_0',
    'Review Request — Same Day',
    'Thank you for letting us take care of your roof!',
    'Thank you for letting us take care of your roof!

If you had a great experience, would you mind leaving us a quick review?

Here''s the link: {{google_review_link}}

It really means a lot.

{{sender_name}}',
    TRUE,
    'casual'
  ) ON CONFLICT DO NOTHING;

  -- Phase 1: Review Collection - Message 2 (48 Hours)
  INSERT INTO public.email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'review_request_day_2',
    'Review Request — 48 Hours',
    'Just checking in',
    'Just checking in — your feedback helps homeowners in {{city}} choose a reliable roofer.

Here''s the review link again if you have a moment ❤️

{{google_review_link}}

Thanks!

{{sender_name}}',
    TRUE,
    'casual'
  ) ON CONFLICT DO NOTHING;

  -- Phase 1: Review Collection - Message 3 (7 Days)
  INSERT INTO public.email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'review_request_day_7',
    'Review Request — 7 Days',
    'Hope your roof is holding up great!',
    'Hope your roof is holding up great!

If you haven''t left a review yet, here''s a quick link to help others in the area:

{{google_review_link}}

Thanks for choosing us!

{{sender_name}}',
    TRUE,
    'casual'
  ) ON CONFLICT DO NOTHING;

  -- Phase 2: Referral Generation - Message 1 (Neighbor Check)
  INSERT INTO public.email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'referral_neighbor_check',
    'Referral Request — Neighbor Check',
    'Quick question about your neighbors',
    'By the way — if you know anyone else in {{neighborhood}} who may need roof work or an inspection, feel free to connect us.

We''d love to help them too!

{{sender_name}}',
    TRUE,
    'casual'
  ) ON CONFLICT DO NOTHING;

  -- Phase 2: Referral Generation - Message 2 (Family & Friends)
  INSERT INTO public.email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'referral_family_friends',
    'Referral Request — Family & Friends',
    'Quick question',
    'Quick question — do you have any family members dealing with leaks or storm damage?

We can take a look for free.

{{sender_name}}',
    TRUE,
    'casual'
  ) ON CONFLICT DO NOTHING;

  -- Phase 2: Referral Generation - Message 3 (Reward Referral)
  INSERT INTO public.email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'referral_reward',
    'Referral Request — Reward Offer',
    'Referral reward',
    'If you send a referral that books a job, we''ll send you a $100 thank-you card.

Know anyone who needs roof work?

{{sender_name}}',
    TRUE,
    'casual'
  ) ON CONFLICT DO NOTHING;

  -- Phase 3: Long-Term Relationship - 1 Month
  INSERT INTO public.email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'long_term_1_month',
    'Long-Term Check-In — 1 Month',
    'Hope everything still looks perfect',
    'Hope everything still looks perfect — let us know if anything feels off.

We''re here if you need anything!

{{sender_name}}',
    TRUE,
    'casual'
  ) ON CONFLICT DO NOTHING;

  -- Phase 3: Long-Term Relationship - 6 Months
  INSERT INTO public.email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'long_term_6_months',
    'Long-Term Check-In — 6 Months',
    'It''s been a while',
    'It''s been a while — need us to check for wear, wind lift, or early-season damage?

Just let us know!

{{sender_name}}',
    TRUE,
    'casual'
  ) ON CONFLICT DO NOTHING;

  -- Phase 3: Long-Term Relationship - 12 Months (Anniversary)
  INSERT INTO public.email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'long_term_12_months',
    'Long-Term Check-In — 12 Months (Anniversary)',
    'One year since your new roof!',
    'One year since your new roof! Want a free inspection to confirm everything is still watertight?

Just reply and we''ll schedule it.

{{sender_name}}',
    TRUE,
    'casual'
  ) ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- PART 9: FUNCTION — Start Review & Referral Sequence
-- ============================================================================
-- Called when a job moves to "installed" stage

CREATE OR REPLACE FUNCTION public.start_review_referral_sequence(
  p_lead_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
  v_workspace_id UUID;
  v_sequence_id UUID;
  v_installed_at TIMESTAMPTZ;
  v_review_link TEXT;
  v_city TEXT;
  v_neighborhood TEXT;
  v_sender_name TEXT;
BEGIN
  -- Get lead info
  SELECT 
    id,
    workspace_id,
    installed_at,
    city,
    address,
    first_name,
    last_name
  INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  IF v_lead.installed_at IS NULL THEN
    RAISE EXCEPTION 'Lead has not been installed yet';
  END IF;

  v_workspace_id := v_lead.workspace_id;
  v_installed_at := v_lead.installed_at;
  v_city := COALESCE(v_lead.city, 'your area');
  v_neighborhood := COALESCE(v_lead.address, 'your neighborhood');
  v_sender_name := COALESCE(v_lead.first_name || ' ' || v_lead.last_name, 'SmartSend Team');

  -- Check if sequence already exists
  SELECT id INTO v_sequence_id
  FROM public.review_referral_sequences
  WHERE lead_id = p_lead_id
  LIMIT 1;

  IF v_sequence_id IS NOT NULL THEN
    RETURN v_sequence_id; -- Already started
  END IF;

  -- Get primary review link
  SELECT review_url INTO v_review_link
  FROM public.review_links
  WHERE workspace_id = v_workspace_id
    AND is_primary = true
    AND is_active = true
  LIMIT 1;

  -- Create sequence
  INSERT INTO public.review_referral_sequences (
    lead_id,
    workspace_id,
    status,
    current_phase,
    current_step,
    installed_at,
    review_collection_started_at
  )
  VALUES (
    p_lead_id,
    v_workspace_id,
    'active',
    'review_collection',
    0,
    v_installed_at,
    now()
  )
  RETURNING id INTO v_sequence_id;

  -- Schedule Phase 1 messages (Review Collection)
  -- Message 1: Same day (immediate)
  INSERT INTO public.review_referral_messages (
    sequence_id,
    lead_id,
    workspace_id,
    phase,
    step_number,
    subject,
    body_html,
    body_text,
    scheduled_for
  )
  VALUES (
    v_sequence_id,
    p_lead_id,
    v_workspace_id,
    'review_collection',
    1,
    'Thank you for letting us take care of your roof!',
    'Thank you for letting us take care of your roof!<br><br>If you had a great experience, would you mind leaving us a quick review?<br><br>Here''s the link: <a href="' || COALESCE(v_review_link, '#') || '">Leave a Review</a><br><br>It really means a lot.<br><br>' || v_sender_name,
    'Thank you for letting us take care of your roof!

If you had a great experience, would you mind leaving us a quick review?

Here''s the link: ' || COALESCE(v_review_link, '#') || '

It really means a lot.

' || v_sender_name,
    now() -- Send immediately
  );

  -- Message 2: 48 hours later
  INSERT INTO public.review_referral_messages (
    sequence_id,
    lead_id,
    workspace_id,
    phase,
    step_number,
    subject,
    body_html,
    body_text,
    scheduled_for
  )
  VALUES (
    v_sequence_id,
    p_lead_id,
    v_workspace_id,
    'review_collection',
    2,
    'Just checking in',
    'Just checking in — your feedback helps homeowners in ' || v_city || ' choose a reliable roofer.<br><br>Here''s the review link again if you have a moment ❤️<br><br><a href="' || COALESCE(v_review_link, '#') || '">Leave a Review</a><br><br>Thanks!<br><br>' || v_sender_name,
    'Just checking in — your feedback helps homeowners in ' || v_city || ' choose a reliable roofer.

Here''s the review link again if you have a moment ❤️

' || COALESCE(v_review_link, '#') || '

Thanks!

' || v_sender_name,
    v_installed_at + INTERVAL '48 hours'
  );

  -- Message 3: 7 days later
  INSERT INTO public.review_referral_messages (
    sequence_id,
    lead_id,
    workspace_id,
    phase,
    step_number,
    subject,
    body_html,
    body_text,
    scheduled_for
  )
  VALUES (
    v_sequence_id,
    p_lead_id,
    v_workspace_id,
    'review_collection',
    3,
    'Hope your roof is holding up great!',
    'Hope your roof is holding up great!<br><br>If you haven''t left a review yet, here''s a quick link to help others in the area:<br><br><a href="' || COALESCE(v_review_link, '#') || '">Leave a Review</a><br><br>Thanks for choosing us!<br><br>' || v_sender_name,
    'Hope your roof is holding up great!

If you haven''t left a review yet, here''s a quick link to help others in the area:

' || COALESCE(v_review_link, '#') || '

Thanks for choosing us!

' || v_sender_name,
    v_installed_at + INTERVAL '7 days'
  );

  -- Schedule Phase 2 messages (Referral Generation) - starts after Phase 1 (Day 10)
  -- Message 1: Neighbor Check
  INSERT INTO public.review_referral_messages (
    sequence_id,
    lead_id,
    workspace_id,
    phase,
    step_number,
    subject,
    body_html,
    body_text,
    scheduled_for
  )
  VALUES (
    v_sequence_id,
    p_lead_id,
    v_workspace_id,
    'referral_generation',
    1,
    'Quick question about your neighbors',
    'By the way — if you know anyone else in ' || v_neighborhood || ' who may need roof work or an inspection, feel free to connect us.<br><br>We''d love to help them too!<br><br>' || v_sender_name,
    'By the way — if you know anyone else in ' || v_neighborhood || ' who may need roof work or an inspection, feel free to connect us.

We''d love to help them too!

' || v_sender_name,
    v_installed_at + INTERVAL '10 days'
  );

  -- Message 2: Family & Friends
  INSERT INTO public.review_referral_messages (
    sequence_id,
    lead_id,
    workspace_id,
    phase,
    step_number,
    subject,
    body_html,
    body_text,
    scheduled_for
  )
  VALUES (
    v_sequence_id,
    p_lead_id,
    v_workspace_id,
    'referral_generation',
    2,
    'Quick question',
    'Quick question — do you have any family members dealing with leaks or storm damage?<br><br>We can take a look for free.<br><br>' || v_sender_name,
    'Quick question — do you have any family members dealing with leaks or storm damage?

We can take a look for free.

' || v_sender_name,
    v_installed_at + INTERVAL '12 days'
  );

  -- Message 3: Reward Referral
  INSERT INTO public.review_referral_messages (
    sequence_id,
    lead_id,
    workspace_id,
    phase,
    step_number,
    subject,
    body_html,
    body_text,
    scheduled_for
  )
  VALUES (
    v_sequence_id,
    p_lead_id,
    v_workspace_id,
    'referral_generation',
    3,
    'Referral reward',
    'If you send a referral that books a job, we''ll send you a $100 thank-you card.<br><br>Know anyone who needs roof work?<br><br>' || v_sender_name,
    'If you send a referral that books a job, we''ll send you a $100 thank-you card.

Know anyone who needs roof work?

' || v_sender_name,
    v_installed_at + INTERVAL '14 days'
  );

  -- Schedule Phase 3 messages (Long-Term Relationship)
  -- Message 1: 1 Month
  INSERT INTO public.review_referral_messages (
    sequence_id,
    lead_id,
    workspace_id,
    phase,
    step_number,
    subject,
    body_html,
    body_text,
    scheduled_for
  )
  VALUES (
    v_sequence_id,
    p_lead_id,
    v_workspace_id,
    'long_term_relationship',
    1,
    'Hope everything still looks perfect',
    'Hope everything still looks perfect — let us know if anything feels off.<br><br>We''re here if you need anything!<br><br>' || v_sender_name,
    'Hope everything still looks perfect — let us know if anything feels off.

We''re here if you need anything!

' || v_sender_name,
    v_installed_at + INTERVAL '1 month'
  );

  -- Message 2: 6 Months
  INSERT INTO public.review_referral_messages (
    sequence_id,
    lead_id,
    workspace_id,
    phase,
    step_number,
    subject,
    body_html,
    body_text,
    scheduled_for
  )
  VALUES (
    v_sequence_id,
    p_lead_id,
    v_workspace_id,
    'long_term_relationship',
    2,
    'It''s been a while',
    'It''s been a while — need us to check for wear, wind lift, or early-season damage?<br><br>Just let us know!<br><br>' || v_sender_name,
    'It''s been a while — need us to check for wear, wind lift, or early-season damage?

Just let us know!

' || v_sender_name,
    v_installed_at + INTERVAL '6 months'
  );

  -- Message 3: 12 Months (Anniversary)
  INSERT INTO public.review_referral_messages (
    sequence_id,
    lead_id,
    workspace_id,
    phase,
    step_number,
    subject,
    body_html,
    body_text,
    scheduled_for
  )
  VALUES (
    v_sequence_id,
    p_lead_id,
    v_workspace_id,
    'long_term_relationship',
    3,
    'One year since your new roof!',
    'One year since your new roof! Want a free inspection to confirm everything is still watertight?<br><br>Just reply and we''ll schedule it.<br><br>' || v_sender_name,
    'One year since your new roof! Want a free inspection to confirm everything is still watertight?

Just reply and we''ll schedule it.

' || v_sender_name,
    v_installed_at + INTERVAL '12 months'
  );

  RETURN v_sequence_id;
END;
$$;

COMMENT ON FUNCTION public.start_review_referral_sequence IS 'Starts review & referral sequence when job is installed (Block 24540)';

-- ============================================================================
-- PART 10: FUNCTION — Detect Negative Sentiment and Cancel Sequence
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_negative_sentiment(
  p_lead_id UUID,
  p_message_text TEXT,
  p_sentiment_score NUMERIC DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sequence_id UUID;
  v_workspace_id UUID;
  v_lower_text TEXT;
  v_is_negative BOOLEAN := false;
BEGIN
  -- Get workspace and active sequence
  SELECT 
    rrs.id,
    rrs.workspace_id
  INTO v_sequence_id, v_workspace_id
  FROM public.review_referral_sequences rrs
  WHERE rrs.lead_id = p_lead_id
    AND rrs.status = 'active'
  LIMIT 1;

  IF v_sequence_id IS NULL THEN
    RETURN false; -- No active sequence
  END IF;

  v_lower_text := LOWER(p_message_text);

  -- Detect negative keywords/phrases
  IF (
    v_lower_text LIKE '%not happy%' OR
    v_lower_text LIKE '%unhappy%' OR
    v_lower_text LIKE '%disappointed%' OR
    v_lower_text LIKE '%problem%' OR
    v_lower_text LIKE '%issue%' OR
    v_lower_text LIKE '%complaint%' OR
    v_lower_text LIKE '%bad%' OR
    v_lower_text LIKE '%terrible%' OR
    v_lower_text LIKE '%awful%' OR
    v_lower_text LIKE '%worst%' OR
    v_lower_text LIKE '%not satisfied%' OR
    v_lower_text LIKE '%unsatisfied%' OR
    v_lower_text LIKE '%poor%' OR
    v_lower_text LIKE '%disappointed%' OR
    (v_sentiment_score IS NOT NULL AND v_sentiment_score < 0.3)
  ) THEN
    v_is_negative := true;
  END IF;

  IF v_is_negative THEN
    -- Log negative sentiment
    INSERT INTO public.negative_sentiment_logs (
      lead_id,
      workspace_id,
      sequence_id,
      message_text,
      sentiment_score,
      action_taken
    )
    VALUES (
      p_lead_id,
      v_workspace_id,
      v_sequence_id,
      p_message_text,
      p_sentiment_score,
      'sequence_cancelled'
    );

    -- Cancel sequence
    UPDATE public.review_referral_sequences
    SET 
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_reason = 'Negative sentiment detected in homeowner reply',
      updated_at = now()
    WHERE id = v_sequence_id;

    -- Cancel all pending messages
    UPDATE public.review_referral_messages
    SET 
      status = 'cancelled',
      updated_at = now()
    WHERE sequence_id = v_sequence_id
      AND status = 'scheduled';

    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.detect_negative_sentiment IS 'Detects negative sentiment and cancels review/referral sequence (Block 24540)';

-- ============================================================================
-- PART 11: FUNCTION — Get Review & Referral Dashboard Metrics
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_review_referral_dashboard(
  p_workspace_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'reviews_this_month', (
      SELECT COUNT(*)
      FROM public.reviews_tracked
      WHERE workspace_id = p_workspace_id
        AND reviewed_at >= date_trunc('month', now())
    ),
    'pending_reviews', (
      SELECT COUNT(*)
      FROM public.review_referral_sequences rrs
      WHERE rrs.workspace_id = p_workspace_id
        AND rrs.status = 'active'
        AND rrs.current_phase = 'review_collection'
    ),
    'referral_leads_generated', (
      SELECT COUNT(*)
      FROM public.referrals_tracked
      WHERE workspace_id = p_workspace_id
        AND created_at >= date_trunc('month', now())
    ),
    'jobs_from_referrals', (
      SELECT COUNT(*)
      FROM public.referrals_tracked rt
      JOIN public.leads l ON l.id = rt.referred_lead_id
      WHERE rt.workspace_id = p_workspace_id
        AND l.roofing_pipeline_stage IN ('approved', 'scheduled', 'installed')
        AND rt.created_at >= date_trunc('month', now())
    ),
    'avg_review_rating', (
      SELECT COALESCE(AVG(rating), 0)
      FROM public.reviews_tracked
      WHERE workspace_id = p_workspace_id
        AND rating IS NOT NULL
        AND reviewed_at >= date_trunc('month', now())
    ),
    'total_reviews', (
      SELECT COUNT(*)
      FROM public.reviews_tracked
      WHERE workspace_id = p_workspace_id
    ),
    'total_referrals', (
      SELECT COUNT(*)
      FROM public.referrals_tracked
      WHERE workspace_id = p_workspace_id
    ),
    'active_sequences', (
      SELECT COUNT(*)
      FROM public.review_referral_sequences
      WHERE workspace_id = p_workspace_id
        AND status = 'active'
    ),
    'completed_sequences', (
      SELECT COUNT(*)
      FROM public.review_referral_sequences
      WHERE workspace_id = p_workspace_id
        AND status = 'completed'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_review_referral_dashboard IS 'Returns review & referral dashboard metrics for a workspace (Block 24540)';

-- ============================================================================
-- PART 12: TRIGGER — Auto-Start Sequence When Job Moves to Installed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_start_review_referral_on_installed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When a lead moves to 'installed' stage and has installed_at timestamp
  IF NEW.roofing_pipeline_stage = 'installed' 
     AND NEW.installed_at IS NOT NULL 
     AND (OLD.roofing_pipeline_stage IS NULL OR OLD.roofing_pipeline_stage != 'installed') THEN
    
    -- Start the review & referral sequence
    PERFORM public.start_review_referral_sequence(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_start_review_referral_on_installed ON public.leads;
CREATE TRIGGER trg_start_review_referral_on_installed
  AFTER UPDATE OF roofing_pipeline_stage, installed_at ON public.leads
  FOR EACH ROW
  WHEN (NEW.roofing_pipeline_stage = 'installed' AND NEW.installed_at IS NOT NULL)
  EXECUTE FUNCTION public.trigger_start_review_referral_on_installed();

-- ============================================================================
-- PART 13: RLS POLICIES
-- ============================================================================

-- Review links
ALTER TABLE public.review_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view review links for their workspace"
  ON public.review_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = review_links.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage review links for their workspace"
  ON public.review_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = review_links.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Review/referral sequences
ALTER TABLE public.review_referral_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sequences for their workspace"
  ON public.review_referral_sequences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = review_referral_sequences.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "SmartSend system can manage sequences"
  ON public.review_referral_sequences FOR ALL
  WITH CHECK (true);

-- Review/referral messages
ALTER TABLE public.review_referral_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages for their workspace"
  ON public.review_referral_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = review_referral_messages.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "SmartSend system can manage messages"
  ON public.review_referral_messages FOR ALL
  WITH CHECK (true);

-- Reviews tracked
ALTER TABLE public.reviews_tracked ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reviews for their workspace"
  ON public.reviews_tracked FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = reviews_tracked.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage reviews for their workspace"
  ON public.reviews_tracked FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = reviews_tracked.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Referrals tracked
ALTER TABLE public.referrals_tracked ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view referrals for their workspace"
  ON public.referrals_tracked FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = referrals_tracked.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage referrals for their workspace"
  ON public.referrals_tracked FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = referrals_tracked.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Negative sentiment logs
ALTER TABLE public.negative_sentiment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view negative sentiment logs for their workspace"
  ON public.negative_sentiment_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = negative_sentiment_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 14: GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.review_links TO authenticated;
GRANT SELECT ON public.review_referral_sequences TO authenticated;
GRANT SELECT ON public.review_referral_messages TO authenticated;
GRANT SELECT ON public.reviews_tracked TO authenticated;
GRANT SELECT ON public.referrals_tracked TO authenticated;






































