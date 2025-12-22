-- ============================================================
-- Block 258400 — SmartSend Reputation & Review Engine v1
-- Google Reviews Automation • NPS • Feedback Loops • Referral Boosting
-- ============================================================
--
-- This block turns SmartSend into the reputation engine that:
--   - Automatically requests Google reviews at the happiest moment
--   - Captures NPS + qualitative feedback
--   - Routes negative feedback to project managers before it hits Google
--   - Tracks referrals from happy customers
--   - Surfaces crew / tech quality and customer sentiment for owners
--
-- It is designed to plug into existing:
--   - public.customers (Block 254400 — Lifetime Value Engine)
--   - public.jobs / public.roofing_jobs (pipeline + production)
--   - public.repair_jobs (Block 255500 — Repair Division Engine)
--   - public.invoices (Block 257100 — Accounting & Billing Engine)
--   - public.referrals (Block 254400 — Referral Tracking)
-- ============================================================

-- ============================================================
-- PART 1 — CUSTOMER_FEEDBACK TABLE (NPS + Post-Job Feedback)
-- ============================================================
-- Central feedback ledger for:
--   - NPS survey responses
--   - Post-job satisfaction ratings
--   - Crew / technician ratings
--   - Free-text feedback that powers sentiment analysis

CREATE TABLE IF NOT EXISTS public.customer_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership / scoping
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,

  -- Who + which job this feedback is about
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  repair_job_id uuid REFERENCES public.repair_jobs(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,

  -- Classification
  feedback_type text NOT NULL DEFAULT 'post_job' CHECK (feedback_type IN (
    'post_job',     -- generic post-project feedback
    'nps',          -- explicit NPS survey result
    'review',       -- review captured inside SmartSend (e.g. portal)
    'issue',        -- complaint / issue report
    'crew',         -- crew / tech rating
    'repair'        -- repair-specific feedback
  )),
  channel text DEFAULT 'sms' CHECK (channel IN (
    'sms', 'email', 'portal', 'phone', 'internal', 'other'
  )),

  -- Core scores
  rating int CHECK (rating BETWEEN 1 AND 5),              -- 1–5 star rating
  nps_score int CHECK (nps_score BETWEEN 0 AND 10),        -- 0–10 NPS scale
  nps_category text CHECK (nps_category IN (
    'promoter',  -- 9–10
    'passive',   -- 7–8
    'detractor'  -- 0–6
  )),

  -- Basic sentiment label (AI / app can populate)
  sentiment text, -- e.g. 'very_positive','positive','neutral','negative','very_negative'

  -- Free text from the customer
  feedback text,
  internal_notes text,

  -- Allows the engine to attach extra structured data per record
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_customer_feedback_team_created
  ON public.customer_feedback(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_customer
  ON public.customer_feedback(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_job
  ON public.customer_feedback(job_id) WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_feedback_roofing_job
  ON public.customer_feedback(roofing_job_id) WHERE roofing_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_feedback_repair_job
  ON public.customer_feedback(repair_job_id) WHERE repair_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_feedback_crew_member
  ON public.customer_feedback(crew_member_id) WHERE crew_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_feedback_nps_category
  ON public.customer_feedback(team_id, nps_category) WHERE nps_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_feedback_rating
  ON public.customer_feedback(team_id, rating) WHERE rating IS NOT NULL;


-- ============================================================
-- PART 2 — REVIEW_REQUESTS TABLE (Google Review Auto-Requests)
-- ============================================================
-- Tracks every automated / manual review request so we can measure:
--   - how many requests were sent
--   - who clicked
--   - who actually left a review
--   - which jobs / customers generated the most social proof

CREATE TABLE IF NOT EXISTS public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership / scoping
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,

  -- Target
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  repair_job_id uuid REFERENCES public.repair_jobs(id) ON DELETE SET NULL,

  -- How / where we asked for the review
  channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','email','portal','other')),
  platform text NOT NULL DEFAULT 'google' CHECK (platform IN ('google','facebook','bbb','other')),
  review_link text,

  -- Lifecycle state
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',   -- created but not yet clicked
    'clicked',   -- customer clicked the link
    'reviewed',  -- confirmed review completed
    'blocked',   -- intentionally blocked (e.g. negative feedback)
    'failed'     -- sending failed / bounced
  )),

  sent_at timestamptz NOT NULL DEFAULT now(),
  clicked_at timestamptz,
  reviewed_at timestamptz,
  failed_reason text,

  -- Optional linkage to an internal feedback row
  feedback_id uuid REFERENCES public.customer_feedback(id) ON DELETE SET NULL,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_review_requests_team_created
  ON public.review_requests(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_requests_customer
  ON public.review_requests(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_requests_job
  ON public.review_requests(job_id) WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_review_requests_platform_status
  ON public.review_requests(team_id, platform, status);

CREATE INDEX IF NOT EXISTS idx_review_requests_reviewed_at
  ON public.review_requests(team_id, reviewed_at) WHERE reviewed_at IS NOT NULL;


-- ============================================================
-- PART 3 — NPS HANDLER + NEGATIVE FEEDBACK ROUTING
-- ============================================================
-- Handles NPS responses (1–10) and:
--   - classifies customer as promoter / passive / detractor
--   - writes to customer_feedback
--   - routes detractors into customer_events for PM follow-up
--   - blocks active review requests for that job so 1-stars never hit Google

CREATE OR REPLACE FUNCTION public.handle_nps_response(
  p_team_id uuid,
  p_customer_id uuid,
  p_job_id uuid DEFAULT NULL,
  p_roofing_job_id uuid DEFAULT NULL,
  p_repair_job_id uuid DEFAULT NULL,
  p_score int,
  p_feedback text DEFAULT NULL,
  p_channel text DEFAULT 'sms'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_category text;
  v_feedback_id uuid;
BEGIN
  IF p_score IS NULL OR p_score < 0 OR p_score > 10 THEN
    RAISE EXCEPTION 'NPS score must be between 0 and 10';
  END IF;

  -- Classify NPS
  IF p_score >= 9 THEN
    v_category := 'promoter';
  ELSIF p_score >= 7 THEN
    v_category := 'passive';
  ELSE
    v_category := 'detractor';
  END IF;

  -- Insert feedback row
  INSERT INTO public.customer_feedback (
    team_id,
    customer_id,
    job_id,
    roofing_job_id,
    repair_job_id,
    feedback_type,
    channel,
    nps_score,
    nps_category,
    feedback
  ) VALUES (
    p_team_id,
    p_customer_id,
    p_job_id,
    p_roofing_job_id,
    p_repair_job_id,
    'nps',
    COALESCE(p_channel, 'sms'),
    p_score,
    v_category,
    p_feedback
  ) RETURNING id INTO v_feedback_id;

  -- If detractor: route negative feedback + block review requests
  IF v_category = 'detractor' THEN
    -- 1) Create customer_event for PM (if table exists)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'customer_events'
    ) THEN
      INSERT INTO public.customer_events (
        customer_id,
        team_id,
        event_type,
        title,
        description,
        details,
        priority,
        event_date,
        due_date,
        status
      ) VALUES (
        p_customer_id,
        p_team_id,
        'custom',
        'Negative Customer Feedback',
        format('NPS %s/10. Immediate PM follow-up recommended.', p_score),
        jsonb_build_object(
          'kind', 'negative_feedback',
          'feedback_id', v_feedback_id,
          'job_id', p_job_id,
          'roofing_job_id', p_roofing_job_id,
          'repair_job_id', p_repair_job_id,
          'nps_score', p_score,
          'feedback', p_feedback
        ),
        'urgent',
        current_date,
        current_date,  -- "within 1 hour" SLA handled at app layer
        'pending'
      );
    END IF;

    -- 2) Block any open review_requests tied to this job/customer
    UPDATE public.review_requests rr
    SET
      status = 'blocked',
      metadata = COALESCE(rr.metadata, '{}'::jsonb) || jsonb_build_object(
        'blocked_reason', 'negative_nps',
        'feedback_id', v_feedback_id,
        'blocked_at', now()
      )
    WHERE rr.team_id = p_team_id
      AND rr.status IN ('pending','clicked')
      AND (
        (p_job_id IS NOT NULL AND rr.job_id = p_job_id) OR
        (p_roofing_job_id IS NOT NULL AND rr.roofing_job_id = p_roofing_job_id) OR
        (p_repair_job_id IS NOT NULL AND rr.repair_job_id = p_repair_job_id) OR
        (p_customer_id IS NOT NULL AND rr.customer_id = p_customer_id)
      );

    -- Optional realtime hook for edge functions / workers
    PERFORM pg_notify(
      'negative_feedback_received',
      json_build_object(
        'feedback_id', v_feedback_id,
        'team_id', p_team_id,
        'customer_id', p_customer_id,
        'job_id', p_job_id,
        'roofing_job_id', p_roofing_job_id,
        'repair_job_id', p_repair_job_id,
        'nps_score', p_score
      )::text
    );
  END IF;

  RETURN v_feedback_id;
END;
$$;

COMMENT ON FUNCTION public.handle_nps_response IS 'Block 258400: Records NPS, classifies promoter/passive/detractor, routes detractors and blocks review requests.';


-- ============================================================
-- PART 4 — GOOGLE REVIEW AUTO-REQUEST ON FINAL INVOICE
-- ============================================================
-- When a FINAL invoice is actually sent for a job, we:
--   - create a review_requests row
--   - emit a pg_notify() event so an edge function / worker
--     can fire the actual SMS/email using the correct template

CREATE OR REPLACE FUNCTION public.create_review_request_for_job(
  p_invoice_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice RECORD;
  v_request_id uuid;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  -- Only for FINAL invoices that have actually been sent
  IF v_invoice.invoice_type != 'final' OR v_invoice.sent_at IS NULL THEN
    RETURN NULL;
  END IF;

  -- Avoid duplicates for the same invoice
  IF EXISTS (
    SELECT 1
    FROM public.review_requests rr
    WHERE rr.team_id = v_invoice.team_id
      AND rr.job_id = v_invoice.job_id
      AND rr.customer_id = v_invoice.customer_id
      AND rr.platform = 'google'
      AND rr.status IN ('pending','clicked','reviewed')
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.review_requests (
    team_id,
    customer_id,
    job_id,
    channel,
    platform,
    review_link,
    status,
    sent_at,
    metadata
  ) VALUES (
    v_invoice.team_id,
    v_invoice.customer_id,
    v_invoice.job_id,
    'sms',
    'google',
    NULL,  -- app/edge function will populate actual link based on team settings
    'pending',
    COALESCE(v_invoice.sent_at, now()),
    jsonb_build_object(
      'source', 'final_invoice_sent',
      'invoice_id', v_invoice.id
    )
  ) RETURNING id INTO v_request_id;

  -- Notify async worker / edge function
  PERFORM pg_notify(
    'review_request_created',
    json_build_object(
      'review_request_id', v_request_id,
      'team_id', v_invoice.team_id,
      'customer_id', v_invoice.customer_id,
      'job_id', v_invoice.job_id,
      'invoice_id', v_invoice.id,
      'platform', 'google'
    )::text
  );

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.create_review_request_for_job IS 'Block 258400: Creates Google review request when final invoice is sent and notifies worker.';


CREATE OR REPLACE FUNCTION public.trg_create_review_request_on_final_invoice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only fire when FINAL invoice is newly sent
  IF NEW.invoice_type = 'final'
     AND NEW.sent_at IS NOT NULL
     AND (OLD.sent_at IS NULL OR OLD.sent_at <> NEW.sent_at) THEN
    PERFORM public.create_review_request_for_job(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_request_on_final_invoice ON public.invoices;
CREATE TRIGGER trg_review_request_on_final_invoice
  AFTER UPDATE OF sent_at ON public.invoices
  FOR EACH ROW
  WHEN (NEW.invoice_type = 'final')
  EXECUTE FUNCTION public.trg_create_review_request_on_final_invoice();


-- ============================================================
-- PART 5 — CUSTOMER SENTIMENT ANALYZER
-- ============================================================
-- Lightweight SQL-based sentiment engine that:
--   - looks at latest feedback + NPS
--   - returns Customer Sentiment / Risk Level / Recommended Action

CREATE OR REPLACE FUNCTION public.get_customer_sentiment_summary(
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_latest public.customer_feedback%ROWTYPE;
  v_avg_rating numeric;
  v_last_nps int;
  v_last_nps_category text;
  v_sentiment_label text;
  v_risk_level text;
  v_recommended_action text;
BEGIN
  -- Latest feedback for this customer
  SELECT * INTO v_latest
  FROM public.customer_feedback
  WHERE customer_id = p_customer_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'customer_sentiment', 'Unknown',
      'risk_level', 'Unknown',
      'recommended_action', 'Collect initial feedback',
      'has_feedback', false
    );
  END IF;

  -- Avg rating across all feedback
  SELECT AVG(rating)::numeric(4,2) INTO v_avg_rating
  FROM public.customer_feedback
  WHERE customer_id = p_customer_id AND rating IS NOT NULL;

  -- Last NPS
  SELECT nps_score, nps_category
  INTO v_last_nps, v_last_nps_category
  FROM public.customer_feedback
  WHERE customer_id = p_customer_id AND nps_score IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- Derive human-friendly sentiment + risk
  IF v_last_nps_category = 'detractor' OR (v_latest.rating IS NOT NULL AND v_latest.rating <= 2) THEN
    v_sentiment_label := 'Low';
    v_risk_level := 'High';
    v_recommended_action := 'PM follow-up ASAP';
  ELSIF v_last_nps_category = 'promoter' OR (v_latest.rating IS NOT NULL AND v_latest.rating >= 4) THEN
    v_sentiment_label := 'High';
    v_risk_level := 'Low';
    v_recommended_action := 'Ask for referral';
  ELSE
    v_sentiment_label := 'Medium';
    v_risk_level := 'Moderate';
    v_recommended_action := 'Request additional feedback / quick check-in';
  END IF;

  RETURN jsonb_build_object(
    'customer_sentiment', v_sentiment_label,
    'risk_level', v_risk_level,
    'recommended_action', v_recommended_action,
    'last_rating', v_latest.rating,
    'last_nps_score', v_last_nps,
    'last_nps_category', v_last_nps_category,
    'last_feedback', v_latest.feedback,
    'last_channel', v_latest.channel,
    'last_feedback_type', v_latest.feedback_type,
    'last_feedback_at', v_latest.created_at,
    'avg_rating', v_avg_rating,
    'has_feedback', true
  );
END;
$$;

COMMENT ON FUNCTION public.get_customer_sentiment_summary IS 'Block 258400: Computes Customer Sentiment / Risk / Recommended Action from feedback + NPS.';


-- ============================================================
-- PART 6 — CREW / TECH RATING VIEW
-- ============================================================
-- Surfaces average rating and review count per crew member so owners can
-- see who delights customers and who needs coaching.

CREATE OR REPLACE VIEW public.v_crew_rating_summary AS
SELECT
  cm.id AS crew_member_id,
  cm.name AS crew_member_name,
  cm.workspace_id,
  COUNT(cf.id) AS feedback_count,
  COUNT(cf.id) FILTER (WHERE cf.rating IS NOT NULL) AS rating_count,
  ROUND(AVG(cf.rating)::numeric, 2) AS avg_rating,
  COUNT(cf.id) FILTER (WHERE cf.rating = 5) AS five_star_reviews,
  MIN(cf.created_at) AS first_feedback_at,
  MAX(cf.created_at) AS last_feedback_at
FROM public.crew_members cm
LEFT JOIN public.customer_feedback cf
  ON cf.crew_member_id = cm.id
GROUP BY cm.id, cm.name, cm.workspace_id;

COMMENT ON VIEW public.v_crew_rating_summary IS 'Block 258400: Crew/technician rating summary (avg rating, 5-star count, feedback volume).';


-- ============================================================
-- PART 7 — REVIEW TRACKING DASHBOARD + HEATMAP VIEWS
-- ============================================================

-- Aggregated review stats per team (for dashboard cards)
CREATE OR REPLACE VIEW public.v_review_dashboard AS
SELECT
  t.id AS team_id,
  COALESCE(rr_stats.total_google_reviews, 0) AS total_google_reviews,
  COALESCE(rr_stats.reviews_this_month, 0) AS reviews_this_month,
  COALESCE(rr_stats.auto_requested, 0) AS auto_requested,
  COALESCE(rr_stats.completed, 0) AS completed,
  COALESCE(rr_stats.pending, 0) AS pending,
  COALESCE(cf_stats.avg_rating, 0)::numeric(4,2) AS average_rating
FROM public.teams t
LEFT JOIN (
  SELECT
    team_id,
    COUNT(*) FILTER (WHERE platform = 'google' AND status = 'reviewed') AS total_google_reviews,
    COUNT(*) FILTER (
      WHERE platform = 'google'
        AND status = 'reviewed'
        AND reviewed_at >= date_trunc('month', now())
    ) AS reviews_this_month,
    COUNT(*) AS auto_requested,
    COUNT(*) FILTER (WHERE status = 'reviewed') AS completed,
    COUNT(*) FILTER (WHERE status IN ('pending','clicked')) AS pending
  FROM public.review_requests
  GROUP BY team_id
) rr_stats ON rr_stats.team_id = t.id
LEFT JOIN (
  SELECT
    team_id,
    AVG(rating)::numeric(4,2) AS avg_rating
  FROM public.customer_feedback
  WHERE rating IS NOT NULL
  GROUP BY team_id
) cf_stats ON cf_stats.team_id = t.id;

COMMENT ON VIEW public.v_review_dashboard IS 'Block 258400: Team-level review stats (totals, this month, pending, average rating).';


-- 5-Star Review Heatmap by ZIP (where reviews are coming from)
CREATE OR REPLACE VIEW public.v_review_heatmap_by_zip AS
SELECT
  c.team_id,
  c.city,
  c.state,
  c.zip_code,
  COUNT(cf.id) AS total_reviews,
  COUNT(cf.id) FILTER (WHERE cf.rating = 5) AS five_star_reviews,
  ROUND(AVG(cf.rating)::numeric, 2) AS avg_rating,
  MIN(cf.created_at) AS first_review_at,
  MAX(cf.created_at) AS last_review_at
FROM public.customer_feedback cf
JOIN public.customers c ON c.id = cf.customer_id
WHERE cf.rating IS NOT NULL
  AND c.zip_code IS NOT NULL
GROUP BY c.team_id, c.city, c.state, c.zip_code;

COMMENT ON VIEW public.v_review_heatmap_by_zip IS 'Block 258400: 5-star review heatmap by city/state/ZIP for territory targeting.';


-- ============================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;

-- Team members can see and manage feedback for their team
CREATE POLICY "customer_feedback_team_access" ON public.customer_feedback
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = customer_feedback.team_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = customer_feedback.team_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "review_requests_team_access" ON public.review_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = review_requests.team_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = review_requests.team_id
        AND tm.user_id = auth.uid()
    )
  );


-- ============================================================
-- PART 9 — REVIEW / NPS EMAIL TEMPLATE SEEDS (AI-Ready)
-- ============================================================
-- These plug directly into the Block 489 email_templates table so the
-- AI rewriter + automations can immediately use these flows.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_templates'
  ) THEN
    INSERT INTO public.email_templates (
      id,
      org_id,
      template_key,
      label,
      base_subject,
      base_body,
      use_ai_rewriter,
      tone
    )
    VALUES
      (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000'::uuid,
        'nps_survey_post_job',
        'NPS Survey — Post-Job',
        'How likely are you to recommend us?',
'Hi {{first_name}},

Now that your project is wrapped up, we''d love your quick feedback.

On a scale of 0–10, how likely are you to recommend us to a friend or neighbor?

{{nps_link}}

Your response helps us keep crews sharp and homeowners happy.

Thank you,
{{sender_name}}',
        TRUE,
        'casual'
      ),
      (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000'::uuid,
        'nps_promoter_referral_request',
        'NPS Promoter — Ask for Referral',
        'Glad you had a great experience',
'Hi {{first_name}},

Thank you for the awesome feedback — we''re glad you loved your experience.

If you know a neighbor, friend, or family member who needs roof or exterior help, we''d be honored to help them too.

You can reply here with their name and phone, or share this link:
{{referral_link}}

Thanks again for trusting us,
{{sender_name}}',
        TRUE,
        'casual'
      ),
      (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000'::uuid,
        'nps_detractor_followup',
        'NPS Detractor — Personal Follow-Up',
        'We want to make this right',
'Hi {{first_name}},

I saw your recent feedback and I''m really sorry we didn''t deliver the experience you expected.

If you''re open to it, I''d love to personally connect, understand what went wrong, and fix it.

You can reply directly to this email or call/text me at {{pm_phone}}.

Thank you for being honest with us — it truly helps us improve.

{{sender_name}}',
        TRUE,
        'neutral'
      ),
      (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000'::uuid,
        'google_review_request_post_completion',
        'Google Review Request — Project Complete',
        'Quick favor? Your review helps homeowners find us',
'Hi {{first_name}},

Your project is complete — we hope you''re loving everything so far.

If you had a great experience, would you mind leaving us a quick 5-star review on Google? It helps local homeowners choose a contractor they can trust.

{{google_review_link}}

Thank you for trusting us with your home,
{{sender_name}}',
        TRUE,
        'casual'
      ),
      (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000'::uuid,
        'review_response_positive',
        'Reply to 5-Star Review',
        'Thank you for the amazing review',
'Hi {{first_name}},

Thank you so much for the kind words and 5-star review — it means a lot to our crew and our business.

If you ever need anything with your roof or exterior in the future, just reach out anytime.

We really appreciate you,
{{sender_name}}',
        TRUE,
        'casual'
      ),
      (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000'::uuid,
        'review_response_negative',
        'Reply to Negative Review',
        'We dropped the ball — let''s fix it',
'Hi {{first_name}},

I''m really sorry to read about your experience — this isn''t the standard we hold ourselves to.

I''d like to personally own this and make it right. If you''re open to it, please reply here or call/text me at {{pm_phone}} so we can fix the issue as quickly as possible.

Thank you for the honest feedback,
{{sender_name}}',
        TRUE,
        'neutral'
      )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;


-- ============================================================
-- PART 10 — COMMENTS
-- ============================================================

COMMENT ON TABLE public.customer_feedback IS 'Block 258400: Central feedback ledger (NPS, ratings, crew feedback, issues) per customer/job.';
COMMENT ON TABLE public.review_requests IS 'Block 258400: Google/online review request tracking (sent, clicked, reviewed, blocked).';
COMMENT ON VIEW public.v_review_dashboard IS 'Block 258400: Review dashboard metrics per team.';
COMMENT ON VIEW public.v_review_heatmap_by_zip IS 'Block 258400: 5-star review heatmap by ZIP for marketing & territory planning.';
COMMENT ON VIEW public.v_crew_rating_summary IS 'Block 258400: Crew/technician rating summary built from customer_feedback.';













