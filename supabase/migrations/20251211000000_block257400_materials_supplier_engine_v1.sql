-- ============================================================
-- Block 257400 — SmartSend Materials & Supplier Engine v1
-- (Material Catalog, PO Automation, Supplier Pricing, Delivery Verification,
--  Inventory & Waste Reporting, Cost Overrun Signals)
-- ============================================================
--
-- This block DOES NOT create a new parallel materials system.
-- It layers smart reporting and readiness logic on top of the existing
-- materials architecture from:
--   - Block 41700  — Material Ordering + Supplier Integration Engine v1
--   - Block 24300  — Material Orders & Supplier Tracking v1
--   - Block 241000 — Supplier Hub v1
--   - Block 254800 — Supplier & Material Network v1
--   - Block 42000  — Crew App & Material Usage Tracking v1
--   - Block 43000  — Job Costs & Overrun Engine v1
--
-- Goal: make SmartSend the MATERIALS BRAIN of the roofing company
-- without duplicating tables that already exist.
-- ============================================================


-- ============================================================
-- PART 1 — Job Material Usage Report (Expected vs Actual vs Waste)
-- ============================================================
--
-- This view turns the raw tables into a simple per-job, per-material
-- usage report that PMs and owners can understand instantly.
--
-- Data sources:
--   Expected = material_orders + material_order_items (Block 41700)
--   Actual   = material_usage (Block 42000 — crew app field reporting)
--
-- Behavior:
--   - Aggregates quantities per job + material (case-insensitive key)
--   - Joins expected vs actual
--   - Computes waste quantity and waste percentage when both exist
-- ============================================================

CREATE OR REPLACE VIEW public.job_material_usage_report AS
WITH expected AS (
  SELECT
    mo.job_id,
    LOWER(TRIM(moi.item_name))        AS material_key,
    MAX(TRIM(moi.item_name))          AS material_name,
    SUM(moi.quantity)                 AS expected_quantity,
    MAX(moi.unit)                     AS expected_unit
  FROM public.material_orders mo
  JOIN public.material_order_items moi
    ON moi.material_order_id = mo.id
  WHERE mo.status NOT IN ('cancelled', 'canceled')
  GROUP BY mo.job_id, LOWER(TRIM(moi.item_name))
),
actual AS (
  SELECT
    mu.job_id,
    LOWER(TRIM(mu.material_name))     AS material_key,
    MAX(TRIM(mu.material_name))       AS material_name,
    SUM(mu.quantity)                  AS actual_quantity,
    MAX(mu.unit)                      AS actual_unit
  FROM public.material_usage mu
  GROUP BY mu.job_id, LOWER(TRIM(mu.material_name))
)
SELECT
  COALESCE(e.job_id, a.job_id)                   AS job_id,
  COALESCE(e.material_key, a.material_key)       AS material_key,
  COALESCE(e.material_name, a.material_name)     AS material_name,

  -- Expected
  e.expected_quantity,
  e.expected_unit,

  -- Actual
  a.actual_quantity,
  a.actual_unit,

  -- Waste: expected - actual (only when both present and expected > 0)
  CASE
    WHEN e.expected_quantity IS NOT NULL
     AND a.actual_quantity IS NOT NULL
     AND e.expected_quantity > a.actual_quantity
    THEN e.expected_quantity - a.actual_quantity
    ELSE 0
  END AS waste_quantity,
  CASE
    WHEN e.expected_quantity IS NOT NULL
     AND a.actual_quantity IS NOT NULL
     AND e.expected_quantity > 0
    THEN ROUND(((e.expected_quantity - a.actual_quantity) / e.expected_quantity) * 100.0, 1)
    ELSE 0
  END AS waste_percent
FROM expected e
FULL OUTER JOIN actual a
  ON e.job_id = a.job_id
 AND e.material_key = a.material_key;

COMMENT ON VIEW public.job_material_usage_report IS
  'Block 257400: Per-job material usage report (expected vs actual vs waste) built on material_orders, material_order_items, and material_usage.';


-- ============================================================
-- PART 2 — Job Material Readiness View
-- ============================================================
--
-- This view answers the single question every PM cares about:
--   "Is this job MATERIALLY READY or will my crew get burned?"
--
-- It pulls from:
--   - material_orders            → whether a material order exists
--   - purchase_orders            → formal POs tied to the job
--   - material_deliveries        → delivery + AI verification + item-level checks
--
-- It surfaces:
--   - has_material_order     (bool)
--   - has_purchase_order     (bool)
--   - materials_delivered    (bool)
--   - materials_verified     (bool — AI/crew verification on delivery)
--   - missing_items          (jsonb list of items short on delivery)
--   - materials_ready_status (text: ''not_ordered'' | ''awaiting_po'' | ''awaiting_delivery'' | ''awaiting_verification'' | ''ready'' | ''issues'')
-- ============================================================

CREATE OR REPLACE VIEW public.job_material_readiness AS
WITH po_by_job AS (
  SELECT
    po.job_id,
    COUNT(*) FILTER (WHERE po.status IS NULL OR po.status NOT IN ('cancelled', 'canceled')) AS po_count
  FROM public.purchase_orders po
  GROUP BY po.job_id
),
latest_delivery_per_job AS (
  SELECT DISTINCT ON (po.job_id)
    po.job_id,
    md.id                         AS material_delivery_id,
    md.delivered,
    md.ai_verification_status,
    md.items_verified
  FROM public.material_deliveries md
  JOIN public.purchase_orders po
    ON po.id = md.purchase_order_id
  WHERE po.job_id IS NOT NULL
  ORDER BY po.job_id, md.created_at DESC
),
missing_items_expanded AS (
  SELECT
    ld.job_id,
    jsonb_agg(
      jsonb_build_object(
        'material_name', item->>'material_name',
        'expected_qty',  (item->>'expected_qty')::numeric,
        'received_qty',  (item->>'received_qty')::numeric,
        'unit',          item->>'unit'
      )
    ) AS missing_items
  FROM latest_delivery_per_job ld
  CROSS JOIN LATERAL jsonb_array_elements(ld.items_verified) AS item
  WHERE ld.items_verified IS NOT NULL
    AND jsonb_typeof(ld.items_verified) = 'array'
    AND COALESCE((item->>'received_qty')::numeric, 0) < COALESCE((item->>'expected_qty')::numeric, 0)
  GROUP BY ld.job_id
)
SELECT
  rj.id                                          AS job_id,
  rj.workspace_id,
  COALESCE(rj.title, rj.job_name, 'Untitled')    AS job_name,

  -- Do we have at least one active material_order?
  EXISTS (
    SELECT 1
    FROM public.material_orders mo
    WHERE mo.job_id = rj.id
      AND mo.status NOT IN ('cancelled', 'canceled')
  ) AS has_material_order,

  -- Do we have at least one non-cancelled purchase_order tied to this job?
  COALESCE(poj.po_count, 0) > 0 AS has_purchase_order,

  -- Latest delivery + AI verification flags
  COALESCE(ld.delivered, false) AS materials_delivered,
  COALESCE(ld.ai_verification_status = 'verified', false) AS materials_verified,

  -- Any missing items on the latest delivery
  mie.missing_items,

  -- High-level readiness state for gating job start
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.material_orders mo
      WHERE mo.job_id = rj.id
        AND mo.status NOT IN ('cancelled', 'canceled')
    ) THEN 'not_ordered'

    WHEN COALESCE(poj.po_count, 0) = 0 THEN 'awaiting_po'

    WHEN COALESCE(ld.delivered, false) = false THEN 'awaiting_delivery'

    WHEN mie.missing_items IS NOT NULL AND jsonb_array_length(mie.missing_items) > 0 THEN 'issues'

    WHEN COALESCE(ld.ai_verification_status = 'verified', false) = false THEN 'awaiting_verification'

    ELSE 'ready'
  END AS materials_ready_status
FROM public.roofing_jobs rj
LEFT JOIN po_by_job poj
  ON poj.job_id = rj.id
LEFT JOIN latest_delivery_per_job ld
  ON ld.job_id = rj.id
LEFT JOIN missing_items_expanded mie
  ON mie.job_id = rj.id;

COMMENT ON VIEW public.job_material_readiness IS
  'Block 257400: Job-level material readiness and missing-items summary built on material_orders, purchase_orders, and material_deliveries.';


-- ============================================================
-- END OF BLOCK 257400 — MATERIALS & SUPPLIER ENGINE v1
-- ============================================================













