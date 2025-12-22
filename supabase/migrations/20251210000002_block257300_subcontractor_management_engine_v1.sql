-- ============================================================
-- Block 257300 — SmartSend Subcontractor Management Engine v1
-- "Sub Database, Digital Work Orders, Quality Scoring, Compliance, Payments"
-- 
-- This block is a thin, opinionated layer on top of the existing
-- subcontractor stack (Blocks 252500, 253800, 254600), giving roofers a
-- clean, roofing-native model:
--
--   - Subcontractor Database (skills, rates, docs, rating, active)
--   - Digital Work Orders (scope, pay, requirements, due date, status)
--   - Quality Scoring (per job + overall)
--   - Compliance Status (COI, W9, Workers Comp)
--   - Payment Tracking (per work order + per subcontractor)
--
-- ZERO NEW DUPLICATE TABLES.
-- We extend existing tables and expose purpose-built views that match
-- the mental model in the Block 257300 spec.
-- ============================================================

-- ============================================================
-- PART 1 — Extend subcontractors profile schema
-- ============================================================
-- Existing table from Block 252500:
--   public.subcontractors (
--     id uuid PK,
--     company_id uuid REFERENCES public.roofing_companies(id),
--     name text NOT NULL,
--     contact_name text,
--     phone text,
--     email text,
--     trade text,
--     status text,
--     created_at, updated_at
--   )
--
-- Here we layer on the richer "roofing subcontractor card":
--   - specialties: shingles, metal, TPO, fascia, tear-off, repairs, etc.
--   - base_rate: baseline pay (e.g. $85/sq)
--   - documents: quick JSON snapshot of COI/W9/license state for UI
--   - rating: cached 0–100 score (can be maintained from scores view)
--   - active: boolean toggle (mirrors status = 'active', but simpler)

ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS specialties text[],          -- e.g. {shingles,tear_off,fascia}
  ADD COLUMN IF NOT EXISTS base_rate numeric(12,2),     -- baseline rate like 85.00 per square
  ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rating numeric,              -- 0–100, derived from performance scores
  ADD COLUMN IF NOT EXISTS active boolean;              -- optional mirror of status = 'active'

COMMENT ON COLUMN public.subcontractors.specialties IS
  'Array of specialties: shingles, metal, repairs, TPO, fascia, tear_off, etc. (Block 257300)';

COMMENT ON COLUMN public.subcontractors.base_rate IS
  'Baseline subcontractor rate (e.g. dollars per square) for quick comparisons (Block 257300)';

COMMENT ON COLUMN public.subcontractors.documents IS
  'Lightweight JSON snapshot of key compliance docs (COI, W9, license, etc.) for UI use (Block 257300)';

COMMENT ON COLUMN public.subcontractors.rating IS
  'Cached 0–100 overall performance rating (can be synced from sub_performance_scores) (Block 257300)';

COMMENT ON COLUMN public.subcontractors.active IS
  'Boolean convenience flag for whether this subcontractor is actively used (Block 257300)';


-- ============================================================
-- PART 2 — Digital Work Orders View (work_orders)
-- ============================================================
-- We already have a rich work orders engine from Block 253800:
--   public.sub_work_orders (
--     id uuid PK,
--     job_id uuid REFERENCES public.jobs(id),
--     subcontractor_id uuid REFERENCES public.subcontractors(id),
--     description text,
--     status text,
--     scheduled_date date,
--     total_estimated_cost numeric,
--     total_actual_cost numeric,
--     tasks jsonb,
--     photo_requirements jsonb,
--     photos_required_count int,
--     photos_submitted_count int,
--     ...
--   )
--
-- Block 257300 wants a simple "digital work order" table:
--   work_orders(id, subcontractor_id, job_id, scope, pay_amount, due_date,
--               status, requirements, created_at)
--
-- We expose that shape as a view backed by sub_work_orders.

CREATE OR REPLACE VIEW public.work_orders AS
SELECT
  swo.id,
  swo.subcontractor_id,
  swo.job_id,
  swo.description AS scope,
  COALESCE(swo.total_actual_cost, swo.total_estimated_cost) AS pay_amount,
  swo.scheduled_date AS due_date,
  swo.status,
  swo.photo_requirements AS requirements,
  swo.created_at
FROM public.sub_work_orders swo;

COMMENT ON VIEW public.work_orders IS
  'Digital subcontractor work orders (scope, pay, requirements, due date, status) backed by sub_work_orders (Block 257300)';


-- ============================================================
-- PART 3 — Quality Scoring View (sub_ratings)
-- ============================================================
-- Existing detailed scoring table from Block 253800:
--   public.sub_performance_scores (
--     id uuid PK,
--     subcontractor_id uuid,
--     job_id uuid,
--     work_order_id uuid,
--     qc_score int,
--     on_time_score int,
--     professionalism_score int,
--     cleanup_score int,
--     safety_score int,
--     overall_score int,
--     notes text,
--     created_at timestamptz,
--     ...
--   )
--
-- Block 257300 spec uses a slightly different naming:
--   sub_ratings(
--     subcontractor_id, job_id,
--     quality_score, cleanup_score, communication_score,
--     safety_score, timeliness_score, notes, created_at
--   )
--
-- We provide a thin renaming view over sub_performance_scores so the
-- app can talk in the simpler language without duplicating data.

CREATE OR REPLACE VIEW public.sub_ratings AS
SELECT
  sps.id,
  sps.subcontractor_id,
  sps.job_id,
  -- Map qc_score → quality_score
  sps.qc_score AS quality_score,
  sps.cleanup_score,
  -- Map professionalism_score → communication_score (closest match)
  sps.professionalism_score AS communication_score,
  sps.safety_score,
  -- Map on_time_score → timeliness_score
  sps.on_time_score AS timeliness_score,
  sps.notes,
  sps.created_at
FROM public.sub_performance_scores sps;

COMMENT ON VIEW public.sub_ratings IS
  'Human-friendly subcontractor ratings view (quality, cleanup, communication, safety, timeliness) backed by sub_performance_scores (Block 257300)';


-- ============================================================
-- PART 4 — Subcontractor Performance + Payments Dashboard View
-- ============================================================
-- This view powers:
--   - "Top Subcontractors" leaderboard
--   - "Subs to Watch" list
--   - "What do we owe this sub?" rollups
--   - Compliance status inline on the same card
--
-- It stitches together:
--   - subcontractors
--   - sub_performance_scores
--   - sub_work_orders
--   - sub_payments
--   - get_sub_compliance_status_v2()
--   - get_sub_performance_tier()

CREATE OR REPLACE VIEW public.subcontractor_performance_dashboard AS
SELECT
  s.id AS subcontractor_id,
  s.company_id,
  s.name,
  s.contact_name,
  s.phone,
  s.email,
  s.trade,
  s.specialties,
  s.base_rate,
  s.rating,
  -- Average overall score from detailed performance scores
  COALESCE(AVG(sps.overall_score), 0) AS avg_overall_score,
  -- Jobs / work orders completed for this sub
  COUNT(DISTINCT CASE WHEN swo.status IN ('completed', 'approved', 'paid') THEN swo.id END) AS jobs_completed,
  -- Outstanding sub payments (pending / approved) for this sub across all work orders
  COALESCE(
    SUM(
      CASE
        WHEN sp.status IN ('pending', 'approved') THEN sp.amount
        ELSE 0
      END
    ),
    0
  ) AS outstanding_payments,
  -- Compliance + performance tier using existing helper functions
  public.get_sub_compliance_status_v2(s.id) AS compliance_status,
  public.get_sub_performance_tier(s.id) AS performance_tier
FROM public.subcontractors s
LEFT JOIN public.sub_work_orders swo
  ON swo.subcontractor_id = s.id
LEFT JOIN public.sub_performance_scores sps
  ON sps.subcontractor_id = s.id
LEFT JOIN public.sub_payments sp
  ON sp.work_order_id = swo.id
GROUP BY
  s.id,
  s.company_id,
  s.name,
  s.contact_name,
  s.phone,
  s.email,
  s.trade,
  s.specialties,
  s.base_rate,
  s.rating;

COMMENT ON VIEW public.subcontractor_performance_dashboard IS
  'Rollup view for subcontractor performance, compliance, and outstanding payments (Block 257300)';


-- ============================================================
-- END OF BLOCK 257300
-- ============================================================














