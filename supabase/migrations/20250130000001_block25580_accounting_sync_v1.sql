-- =========================================================
-- Block 25580 — SmartSend Roofing Accounting Sync v1
-- (Invoice Sync • Payment Sync • QuickBooks Export • Revenue Categorization • Cost Mapping • Accounting Automation)
-- =========================================================
-- 
-- THE ACCOUNTING + BOOKKEEPING ENGINE FOR ROOFERS — ZERO FLUFF.
-- 
-- This block connects SmartSend to the MONEY SYSTEM of the business.
-- 
-- Roofers waste HOURS every week because:
-- ❌ invoices don't match payments
-- ❌ checks go missing
-- ❌ QuickBooks is always behind
-- ❌ job revenue is unclear
-- ❌ insurance checks are confusing
-- ❌ deposits aren't tracked properly
-- ❌ material costs aren't coded right
-- ❌ dump fees never get added
-- ❌ supplement revenue isn't categorized
-- ❌ owners can't see real cashflow
-- ❌ accounting is a mess
-- 
-- SmartSend Accounting Sync v1 FIXES ALL OF IT automatically.

-- ============================================================================
-- PART 1 — CREATE accounting_sync_queue TABLE
-- ============================================================================
-- Tracks what needs to be synced to accounting systems
-- Processes invoices, payments, customers, and cost entries

CREATE TABLE IF NOT EXISTS public.accounting_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- What to sync
  sync_type text NOT NULL CHECK (sync_type IN (
    'invoice',
    'payment',
    'customer',
    'cost_entry',
    'job_revenue',
    'job_costs'
  )),
  
  -- Reference to source record
  source_type text NOT NULL, -- 'job_invoice', 'job_payment', 'roofing_job', 'job_cost_entry', 'contact'
  source_id uuid NOT NULL,
  
  -- Sync status
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'synced', 'failed', 'retry')) DEFAULT 'pending',
  
  -- Export format
  export_format text CHECK (export_format IN ('csv', 'quickbooks_online', 'quickbooks_desktop_iif', 'xero', 'freshbooks')) DEFAULT 'csv',
  
  -- Retry logic
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  last_error text,
  last_error_at timestamptz,
  next_retry_at timestamptz,
  
  -- Sync metadata
  sync_data jsonb DEFAULT '{}'::jsonb, -- Pre-processed data ready for export
  external_id text, -- ID in external accounting system (QB customer ID, etc.)
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  synced_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_accounting_sync_queue_org_status 
  ON public.accounting_sync_queue(org_id, status, created_at);
  
CREATE INDEX IF NOT EXISTS idx_accounting_sync_queue_source 
  ON public.accounting_sync_queue(source_type, source_id);
  
CREATE INDEX IF NOT EXISTS idx_accounting_sync_queue_retry 
  ON public.accounting_sync_queue(next_retry_at, status) 
  WHERE status IN ('failed', 'retry') AND next_retry_at IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE accounting_sync_log TABLE
-- ============================================================================
-- Audit trail of all sync operations

CREATE TABLE IF NOT EXISTS public.accounting_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  queue_id uuid REFERENCES public.accounting_sync_queue(id) ON DELETE SET NULL,
  
  sync_type text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  
  status text NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  export_format text,
  
  -- What was synced
  records_synced integer DEFAULT 0,
  records_failed integer DEFAULT 0,
  
  -- Error details
  error_message text,
  error_details jsonb,
  
  -- Export data snapshot
  export_data jsonb,
  
  -- External system response
  external_response jsonb,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_sync_log_org 
  ON public.accounting_sync_log(org_id, created_at DESC);
  
CREATE INDEX IF NOT EXISTS idx_accounting_sync_log_source 
  ON public.accounting_sync_log(source_type, source_id);

-- ============================================================================
-- PART 3 — CREATE accounting_customer_mapping TABLE
-- ============================================================================
-- Maps SmartSend contacts to accounting system customers

CREATE TABLE IF NOT EXISTS public.accounting_customer_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  -- External accounting system
  accounting_system text NOT NULL CHECK (accounting_system IN ('quickbooks_online', 'quickbooks_desktop', 'xero', 'freshbooks', 'csv')),
  external_customer_id text NOT NULL,
  external_customer_name text NOT NULL,
  
  -- Customer details (snapshot for reference)
  customer_name text NOT NULL,
  customer_email text,
  customer_address text,
  customer_phone text,
  
  -- Sync status
  last_synced_at timestamptz,
  sync_status text CHECK (sync_status IN ('active', 'archived', 'error')) DEFAULT 'active',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(org_id, accounting_system, external_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_accounting_customer_mapping_org 
  ON public.accounting_customer_mapping(org_id, accounting_system);
  
CREATE INDEX IF NOT EXISTS idx_accounting_customer_mapping_contact 
  ON public.accounting_customer_mapping(contact_id) WHERE contact_id IS NOT NULL;
  
CREATE INDEX IF NOT EXISTS idx_accounting_customer_mapping_job 
  ON public.accounting_customer_mapping(job_id) WHERE job_id IS NOT NULL;

-- ============================================================================
-- PART 4 — CREATE accounting_revenue_categories TABLE
-- ============================================================================
-- Defines roofing-specific revenue categories

CREATE TABLE IF NOT EXISTS public.accounting_revenue_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE, -- NULL = system default
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Category definition
  category_key text NOT NULL, -- 'retail_roof', 'insurance_acv', 'insurance_depreciation', etc.
  category_name text NOT NULL,
  description text,
  
  -- Accounting mapping
  accounting_account text NOT NULL, -- 'Income.Retail', 'Income.ACV', etc.
  accounting_class text, -- Optional: Job tracking class
  
  -- Auto-detection rules
  detection_rules jsonb DEFAULT '{}'::jsonb, -- Rules for auto-categorization
  
  -- Status
  is_active boolean DEFAULT true,
  is_system_default boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(org_id, category_key) WHERE org_id IS NOT NULL,
  UNIQUE(category_key) WHERE org_id IS NULL
);

-- Insert system default revenue categories
INSERT INTO public.accounting_revenue_categories (category_key, category_name, description, accounting_account, is_system_default, is_active) VALUES
  ('retail_roof', 'Retail Roof', 'Direct homeowner payment for roof replacement', 'Income.Retail', true, true),
  ('insurance_acv', 'Insurance ACV', 'Actual Cash Value payment from insurance', 'Income.ACV', true, true),
  ('insurance_depreciation', 'Insurance Depreciation', 'Depreciation payment from insurance', 'Income.Depreciation', true, true),
  ('supplements', 'Supplements', 'Supplemental insurance payments', 'Income.Supplement', true, true),
  ('repairs', 'Repairs', 'Roof repair revenue', 'Income.Repairs', true, true),
  ('upgrades', 'Upgrades', 'Upgrade revenue (better materials, etc.)', 'Income.Upgrades', true, true),
  ('inspection_fees', 'Inspection Fees', 'Inspection and assessment fees', 'Income.InspectionFees', true, true),
  ('emergency_services', 'Emergency Services', 'Emergency repair services', 'Income.EmergencyServices', true, true)
ON CONFLICT (category_key) WHERE org_id IS NULL DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_accounting_revenue_categories_org 
  ON public.accounting_revenue_categories(org_id, is_active) WHERE org_id IS NOT NULL;
  
CREATE INDEX IF NOT EXISTS idx_accounting_revenue_categories_workspace 
  ON public.accounting_revenue_categories(workspace_id, is_active) WHERE workspace_id IS NOT NULL;

-- ============================================================================
-- PART 5 — CREATE accounting_cost_mapping TABLE
-- ============================================================================
-- Maps SmartSend cost categories to accounting COGS accounts

CREATE TABLE IF NOT EXISTS public.accounting_cost_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE, -- NULL = system default
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Cost category
  cost_category text NOT NULL CHECK (cost_category IN ('materials', 'labor', 'dumpster', 'permits', 'equipment', 'overhead', 'other')),
  cost_category_display_name text NOT NULL,
  
  -- Accounting mapping
  accounting_account text NOT NULL, -- 'COGS.Material', 'COGS.Labor', etc.
  accounting_class text, -- Optional: Job tracking class
  
  -- Status
  is_active boolean DEFAULT true,
  is_system_default boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(org_id, cost_category) WHERE org_id IS NOT NULL,
  UNIQUE(cost_category) WHERE org_id IS NULL
);

-- Insert system default cost mappings
INSERT INTO public.accounting_cost_mapping (cost_category, cost_category_display_name, accounting_account, is_system_default, is_active) VALUES
  ('materials', 'Material Costs', 'COGS.Material', true, true),
  ('labor', 'Labor Costs', 'COGS.Labor', true, true),
  ('dumpster', 'Dump Fees', 'COGS.Dump', true, true),
  ('permits', 'Permits', 'Job Costs.Permits', true, true),
  ('equipment', 'Equipment Rental', 'Job Expenses.Equipment', true, true),
  ('overhead', 'Overhead', 'COGS.Overhead', true, true),
  ('other', 'Other Costs', 'COGS.Other', true, true)
ON CONFLICT (cost_category) WHERE org_id IS NULL DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_accounting_cost_mapping_org 
  ON public.accounting_cost_mapping(org_id, is_active) WHERE org_id IS NOT NULL;
  
CREATE INDEX IF NOT EXISTS idx_accounting_cost_mapping_workspace 
  ON public.accounting_cost_mapping(workspace_id, is_active) WHERE workspace_id IS NOT NULL;

-- ============================================================================
-- PART 6 — ADD SYNC STATUS FIELDS TO EXISTING TABLES
-- ============================================================================

-- Add sync status to job_invoices
ALTER TABLE public.job_invoices
  ADD COLUMN IF NOT EXISTS accounting_synced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS accounting_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS accounting_sync_error text,
  ADD COLUMN IF NOT EXISTS accounting_revenue_category text,
  ADD COLUMN IF NOT EXISTS accounting_job_id text; -- SmartSend Job ID for QB tracking

CREATE INDEX IF NOT EXISTS idx_job_invoices_accounting_sync 
  ON public.job_invoices(accounting_synced, accounting_synced_at) 
  WHERE accounting_synced = false;

-- Add sync status to job_payments
ALTER TABLE public.job_payments
  ADD COLUMN IF NOT EXISTS accounting_synced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS accounting_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS accounting_sync_error text,
  ADD COLUMN IF NOT EXISTS accounting_revenue_category text;

CREATE INDEX IF NOT EXISTS idx_job_payments_accounting_sync 
  ON public.job_payments(accounting_synced, accounting_synced_at) 
  WHERE accounting_synced = false;

-- Add sync status to roofing_jobs
ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS accounting_synced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS accounting_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS accounting_sync_error text;

-- Add sync status to job_cost_entries
ALTER TABLE public.job_cost_entries
  ADD COLUMN IF NOT EXISTS accounting_synced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS accounting_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS accounting_sync_error text,
  ADD COLUMN IF NOT EXISTS accounting_cost_account text;

CREATE INDEX IF NOT EXISTS idx_job_cost_entries_accounting_sync 
  ON public.job_cost_entries(accounting_synced, accounting_synced_at) 
  WHERE accounting_synced = false;

-- ============================================================================
-- PART 7 — FUNCTION: categorize_revenue
-- ============================================================================
-- Automatically categorizes revenue based on job type, payment type, insurance status

CREATE OR REPLACE FUNCTION public.categorize_revenue(
  p_job_id uuid,
  p_invoice_id uuid DEFAULT NULL,
  p_payment_id uuid DEFAULT NULL,
  p_payment_type text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_job record;
  v_insurance_claim_id uuid;
  v_category text;
  v_payment_type_local text;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN 'retail_roof'; -- Default fallback
  END IF;
  
  -- Get payment type if not provided
  IF p_payment_type IS NULL THEN
    IF p_invoice_id IS NOT NULL THEN
      SELECT payment_type INTO v_payment_type_local
      FROM public.job_invoices
      WHERE id = p_invoice_id;
    ELSIF p_payment_id IS NOT NULL THEN
      SELECT payment_type INTO v_payment_type_local
      FROM public.job_payments
      WHERE id = p_payment_id;
    END IF;
  ELSE
    v_payment_type_local := p_payment_type;
  END IF;
  
  -- Check for insurance claim
  SELECT id INTO v_insurance_claim_id
  FROM public.job_insurance_claims
  WHERE job_id = p_job_id
  LIMIT 1;
  
  -- Categorize based on payment type and insurance status
  IF v_insurance_claim_id IS NOT NULL THEN
    -- Insurance job
    IF v_payment_type_local = 'acv_check' THEN
      RETURN 'insurance_acv';
    ELSIF v_payment_type_local = 'depreciation' THEN
      RETURN 'insurance_depreciation';
    ELSIF v_payment_type_local IN ('supplement', 'supplements') THEN
      RETURN 'supplements';
    ELSE
      -- Check if deductible payment (retail portion)
      RETURN 'retail_roof'; -- Deductible is retail revenue
    END IF;
  ELSE
    -- Retail job
    IF v_job.job_type IN ('repair', 'roof_repair') THEN
      RETURN 'repairs';
    ELSIF v_job.job_type IN ('inspection', 'inspection_only') THEN
      RETURN 'inspection_fees';
    ELSIF v_payment_type_local = 'deposit' AND v_job.job_type = 'emergency' THEN
      RETURN 'emergency_services';
    ELSE
      RETURN 'retail_roof';
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.categorize_revenue IS 'Block 25580: Automatically categorizes revenue based on job type, payment type, and insurance status';

-- ============================================================================
-- PART 8 — FUNCTION: map_cost_to_accounting
-- ============================================================================
-- Maps cost category to accounting account

CREATE OR REPLACE FUNCTION public.map_cost_to_accounting(
  p_org_id uuid,
  p_workspace_id uuid,
  p_cost_category text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_account text;
BEGIN
  -- Try org-specific mapping first
  SELECT accounting_account INTO v_account
  FROM public.accounting_cost_mapping
  WHERE org_id = p_org_id
    AND cost_category = p_cost_category
    AND is_active = true
  LIMIT 1;
  
  -- Fall back to workspace-specific
  IF v_account IS NULL THEN
    SELECT accounting_account INTO v_account
    FROM public.accounting_cost_mapping
    WHERE workspace_id = p_workspace_id
      AND cost_category = p_cost_category
      AND is_active = true
    LIMIT 1;
  END IF;
  
  -- Fall back to system default
  IF v_account IS NULL THEN
    SELECT accounting_account INTO v_account
    FROM public.accounting_cost_mapping
    WHERE org_id IS NULL
      AND cost_category = p_cost_category
      AND is_active = true
    LIMIT 1;
  END IF;
  
  RETURN COALESCE(v_account, 'COGS.Other');
END;
$$;

COMMENT ON FUNCTION public.map_cost_to_accounting IS 'Block 25580: Maps cost category to accounting account (org → workspace → system default)';

-- ============================================================================
-- PART 9 — FUNCTION: queue_accounting_sync
-- ============================================================================
-- Adds records to sync queue

CREATE OR REPLACE FUNCTION public.queue_accounting_sync(
  p_org_id uuid,
  p_workspace_id uuid,
  p_sync_type text,
  p_source_type text,
  p_source_id uuid,
  p_export_format text DEFAULT 'csv'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue_id uuid;
BEGIN
  -- Check if already queued
  SELECT id INTO v_queue_id
  FROM public.accounting_sync_queue
  WHERE org_id = p_org_id
    AND sync_type = p_sync_type
    AND source_type = p_source_type
    AND source_id = p_source_id
    AND status IN ('pending', 'processing', 'retry')
  LIMIT 1;
  
  IF v_queue_id IS NOT NULL THEN
    RETURN v_queue_id; -- Already queued
  END IF;
  
  -- Create new queue entry
  INSERT INTO public.accounting_sync_queue (
    org_id,
    workspace_id,
    sync_type,
    source_type,
    source_id,
    export_format,
    status
  )
  VALUES (
    p_org_id,
    p_workspace_id,
    p_sync_type,
    p_source_type,
    p_source_id,
    p_export_format,
    'pending'
  )
  RETURNING id INTO v_queue_id;
  
  RETURN v_queue_id;
END;
$$;

COMMENT ON FUNCTION public.queue_accounting_sync IS 'Block 25580: Adds a record to the accounting sync queue';

-- ============================================================================
-- PART 10 — FUNCTION: prepare_invoice_export_data
-- ============================================================================
-- Prepares invoice data for export

CREATE OR REPLACE FUNCTION public.prepare_invoice_export_data(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_invoice record;
  v_job record;
  v_contact record;
  v_insurance_claim record;
  v_revenue_category text;
  v_customer_name text;
  v_customer_address text;
  v_export_data jsonb;
BEGIN
  -- Get invoice
  SELECT * INTO v_invoice
  FROM public.job_invoices
  WHERE id = p_invoice_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get job
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = v_invoice.job_id;
  
  -- Get contact/homeowner info
  SELECT c.* INTO v_contact
  FROM public.contacts c
  JOIN public.leads l ON l.contact_id = c.id
  JOIN public.roofing_jobs rj ON rj.lead_id = l.id
  WHERE rj.id = v_job.id
  LIMIT 1;
  
  -- Get insurance claim if exists
  SELECT * INTO v_insurance_claim
  FROM public.job_insurance_claims
  WHERE job_id = v_job.id
  LIMIT 1;
  
  -- Categorize revenue
  v_revenue_category := public.categorize_revenue(
    v_job.id,
    p_invoice_id,
    NULL,
    v_invoice.payment_type
  );
  
  -- Build customer name
  v_customer_name := COALESCE(
    v_contact.first_name || ' ' || v_contact.last_name,
    v_job.title,
    'Customer'
  );
  
  -- Build customer address
  v_customer_address := COALESCE(
    v_contact.address,
    CASE 
      WHEN v_contact.city IS NOT NULL OR v_contact.state IS NOT NULL THEN
        COALESCE(v_contact.city || ', ', '') || COALESCE(v_contact.state || ' ', '') || COALESCE(v_contact.postal_code, '')
      ELSE NULL
    END
  );
  
  -- Build export data
  v_export_data := jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_number', 'SS-' || substring(v_invoice.id::text, 1, 8),
    'invoice_date', v_invoice.created_at,
    'due_date', v_invoice.due_date,
    'amount', v_invoice.amount,
    'status', v_invoice.status,
    'payment_type', v_invoice.payment_type,
    'revenue_category', v_revenue_category,
    'job_id', v_job.id,
    'job_number', 'JOB-' || substring(v_job.id::text, 1, 8),
    'job_title', v_job.title,
    'job_value', v_job.job_value,
    'customer_name', v_customer_name,
    'customer_email', v_contact.email,
    'customer_address', v_customer_address,
    'customer_phone', v_contact.phone,
    'is_insurance', v_insurance_claim.id IS NOT NULL,
    'insurance_carrier', v_insurance_claim.carrier_name,
    'insurance_claim_number', v_insurance_claim.claim_number
  );
  
  RETURN v_export_data;
END;
$$;

COMMENT ON FUNCTION public.prepare_invoice_export_data IS 'Block 25580: Prepares invoice data for accounting export';

-- ============================================================================
-- PART 11 — FUNCTION: prepare_payment_export_data
-- ============================================================================
-- Prepares payment data for export

CREATE OR REPLACE FUNCTION public.prepare_payment_export_data(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_payment record;
  v_invoice record;
  v_job record;
  v_contact record;
  v_revenue_category text;
  v_customer_name text;
  v_export_data jsonb;
BEGIN
  -- Get payment
  SELECT * INTO v_payment
  FROM public.job_payments
  WHERE id = p_payment_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get invoice if linked
  IF v_payment.invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.job_invoices
    WHERE id = v_payment.invoice_id;
  END IF;
  
  -- Get job
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = v_payment.job_id;
  
  -- Get contact
  SELECT c.* INTO v_contact
  FROM public.contacts c
  JOIN public.leads l ON l.contact_id = c.id
  JOIN public.roofing_jobs rj ON rj.lead_id = l.id
  WHERE rj.id = v_job.id
  LIMIT 1;
  
  -- Categorize revenue
  v_revenue_category := public.categorize_revenue(
    v_job.id,
    v_payment.invoice_id,
    p_payment_id,
    v_payment.payment_type
  );
  
  -- Build customer name
  v_customer_name := COALESCE(
    v_payment.payer_name,
    v_contact.first_name || ' ' || v_contact.last_name,
    v_job.title,
    'Customer'
  );
  
  -- Build export data
  v_export_data := jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_date', v_payment.created_at,
    'amount', v_payment.amount,
    'method', v_payment.method,
    'payment_type', v_payment.payment_type,
    'revenue_category', v_revenue_category,
    'invoice_id', v_payment.invoice_id,
    'invoice_number', CASE WHEN v_invoice.id IS NOT NULL THEN 'SS-' || substring(v_invoice.id::text, 1, 8) ELSE NULL END,
    'job_id', v_job.id,
    'job_number', 'JOB-' || substring(v_job.id::text, 1, 8),
    'customer_name', v_customer_name,
    'customer_email', COALESCE(v_payment.payer_email, v_contact.email),
    'check_number', v_payment.check_number,
    'notes', v_payment.notes
  );
  
  RETURN v_export_data;
END;
$$;

COMMENT ON FUNCTION public.prepare_payment_export_data IS 'Block 25580: Prepares payment data for accounting export';

-- ============================================================================
-- PART 12 — FUNCTION: prepare_cost_export_data
-- ============================================================================
-- Prepares cost entry data for export

CREATE OR REPLACE FUNCTION public.prepare_cost_export_data(p_cost_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_cost record;
  v_job record;
  v_account text;
  v_export_data jsonb;
BEGIN
  -- Get cost entry
  SELECT * INTO v_cost
  FROM public.job_cost_entries
  WHERE id = p_cost_entry_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get job
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = v_cost.job_id;
  
  -- Map to accounting account
  v_account := public.map_cost_to_accounting(
    NULL, -- org_id (can be enhanced later)
    v_cost.workspace_id,
    v_cost.category
  );
  
  -- Build export data
  v_export_data := jsonb_build_object(
    'cost_entry_id', v_cost.id,
    'cost_date', v_cost.cost_date,
    'amount', v_cost.amount,
    'category', v_cost.category,
    'description', v_cost.description,
    'vendor', v_cost.vendor,
    'accounting_account', v_account,
    'job_id', v_job.id,
    'job_number', 'JOB-' || substring(v_job.id::text, 1, 8),
    'job_title', v_job.title
  );
  
  RETURN v_export_data;
END;
$$;

COMMENT ON FUNCTION public.prepare_cost_export_data IS 'Block 25580: Prepares cost entry data for accounting export';

-- ============================================================================
-- PART 13 — FUNCTION: export_to_csv
-- ============================================================================
-- Exports sync queue items to CSV format

CREATE OR REPLACE FUNCTION public.export_to_csv(
  p_org_id uuid,
  p_sync_type text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  csv_line text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_queue_record record;
  v_export_data jsonb;
BEGIN
  -- CSV Header
  IF p_sync_type = 'invoice' THEN
    RETURN QUERY SELECT 'Invoice Number,Invoice Date,Due Date,Amount,Status,Payment Type,Revenue Category,Job Number,Job Title,Customer Name,Customer Email,Customer Address,Insurance Carrier,Claim Number'::text;
    
    -- Invoice rows
    FOR v_queue_record IN
      SELECT q.*, i.id as source_id
      FROM public.accounting_sync_queue q
      JOIN public.job_invoices i ON i.id = q.source_id
      WHERE q.org_id = p_org_id
        AND q.sync_type = 'invoice'
        AND (p_start_date IS NULL OR i.created_at::date >= p_start_date)
        AND (p_end_date IS NULL OR i.created_at::date <= p_end_date)
        AND q.status IN ('pending', 'synced')
      ORDER BY i.created_at
    LOOP
      v_export_data := public.prepare_invoice_export_data(v_queue_record.source_id);
      IF v_export_data IS NOT NULL THEN
        RETURN QUERY SELECT format(
          '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s',
          COALESCE(v_export_data->>'invoice_number', ''),
          COALESCE((v_export_data->>'invoice_date')::text, ''),
          COALESCE((v_export_data->>'due_date')::text, ''),
          COALESCE((v_export_data->>'amount')::text, '0'),
          COALESCE(v_export_data->>'status', ''),
          COALESCE(v_export_data->>'payment_type', ''),
          COALESCE(v_export_data->>'revenue_category', ''),
          COALESCE(v_export_data->>'job_number', ''),
          COALESCE(REPLACE(v_export_data->>'job_title', ',', ' '), ''),
          COALESCE(REPLACE(v_export_data->>'customer_name', ',', ' '), ''),
          COALESCE(v_export_data->>'customer_email', ''),
          COALESCE(REPLACE(v_export_data->>'customer_address', ',', ' '), ''),
          COALESCE(v_export_data->>'insurance_carrier', ''),
          COALESCE(v_export_data->>'insurance_claim_number', '')
        )::text;
      END IF;
    END LOOP;
    
  ELSIF p_sync_type = 'payment' THEN
    RETURN QUERY SELECT 'Payment Date,Amount,Method,Payment Type,Revenue Category,Invoice Number,Job Number,Customer Name,Customer Email,Check Number'::text;
    
    -- Payment rows
    FOR v_queue_record IN
      SELECT q.*, p.id as source_id
      FROM public.accounting_sync_queue q
      JOIN public.job_payments p ON p.id = q.source_id
      WHERE q.org_id = p_org_id
        AND q.sync_type = 'payment'
        AND (p_start_date IS NULL OR p.created_at::date >= p_start_date)
        AND (p_end_date IS NULL OR p.created_at::date <= p_end_date)
        AND q.status IN ('pending', 'synced')
      ORDER BY p.created_at
    LOOP
      v_export_data := public.prepare_payment_export_data(v_queue_record.source_id);
      IF v_export_data IS NOT NULL THEN
        RETURN QUERY SELECT format(
          '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s',
          COALESCE((v_export_data->>'payment_date')::text, ''),
          COALESCE((v_export_data->>'amount')::text, '0'),
          COALESCE(v_export_data->>'method', ''),
          COALESCE(v_export_data->>'payment_type', ''),
          COALESCE(v_export_data->>'revenue_category', ''),
          COALESCE(v_export_data->>'invoice_number', ''),
          COALESCE(v_export_data->>'job_number', ''),
          COALESCE(REPLACE(v_export_data->>'customer_name', ',', ' '), ''),
          COALESCE(v_export_data->>'customer_email', ''),
          COALESCE(v_export_data->>'check_number', '')
        )::text;
      END IF;
    END LOOP;
    
  ELSIF p_sync_type = 'cost_entry' THEN
    RETURN QUERY SELECT 'Cost Date,Amount,Category,Description,Vendor,Accounting Account,Job Number,Job Title'::text;
    
    -- Cost entry rows
    FOR v_queue_record IN
      SELECT q.*, c.id as source_id
      FROM public.accounting_sync_queue q
      JOIN public.job_cost_entries c ON c.id = q.source_id
      WHERE q.org_id = p_org_id
        AND q.sync_type = 'cost_entry'
        AND (p_start_date IS NULL OR c.cost_date >= p_start_date)
        AND (p_end_date IS NULL OR c.cost_date <= p_end_date)
        AND q.status IN ('pending', 'synced')
      ORDER BY c.cost_date
    LOOP
      v_export_data := public.prepare_cost_export_data(v_queue_record.source_id);
      IF v_export_data IS NOT NULL THEN
        RETURN QUERY SELECT format(
          '%s,%s,%s,%s,%s,%s,%s,%s',
          COALESCE((v_export_data->>'cost_date')::text, ''),
          COALESCE((v_export_data->>'amount')::text, '0'),
          COALESCE(v_export_data->>'category', ''),
          COALESCE(REPLACE(v_export_data->>'description', ',', ' '), ''),
          COALESCE(REPLACE(v_export_data->>'vendor', ',', ' '), ''),
          COALESCE(v_export_data->>'accounting_account', ''),
          COALESCE(v_export_data->>'job_number', ''),
          COALESCE(REPLACE(v_export_data->>'job_title', ',', ' '), '')
        )::text;
      END IF;
    END LOOP;
  END IF;
  
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.export_to_csv IS 'Block 25580: Exports accounting sync data to CSV format';

-- ============================================================================
-- PART 14 — FUNCTION: export_to_quickbooks_desktop_iif
-- ============================================================================
-- Exports to QuickBooks Desktop IIF format

CREATE OR REPLACE FUNCTION public.export_to_quickbooks_desktop_iif(
  p_org_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  iif_line text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_invoice record;
  v_payment record;
  v_cost record;
  v_export_data jsonb;
  v_account text;
BEGIN
  -- IIF Header
  RETURN QUERY SELECT '!TRNS	TRNSTYPE	DATE	ACCNT	NAME	AMOUNT	MEMO'::text;
  RETURN QUERY SELECT '!SPL	TRNSTYPE	DATE	ACCNT	NAME	AMOUNT	MEMO'::text;
  RETURN QUERY SELECT '!ENDTRNS'::text;
  
  -- Export invoices (as sales receipts)
  FOR v_invoice IN
    SELECT q.*, i.id as source_id
    FROM public.accounting_sync_queue q
    JOIN public.job_invoices i ON i.id = q.source_id
    WHERE q.org_id = p_org_id
      AND q.sync_type = 'invoice'
      AND (p_start_date IS NULL OR i.created_at::date >= p_start_date)
      AND (p_end_date IS NULL OR i.created_at::date <= p_end_date)
      AND q.status IN ('pending', 'synced')
    ORDER BY i.created_at
  LOOP
    v_export_data := public.prepare_invoice_export_data(v_invoice.source_id);
    IF v_export_data IS NOT NULL THEN
      -- Get revenue account
      SELECT accounting_account INTO v_account
      FROM public.accounting_revenue_categories
      WHERE category_key = v_export_data->>'revenue_category'
        AND is_active = true
      LIMIT 1;
      
      IF v_account IS NULL THEN
        v_account := 'Income.Retail';
      END IF;
      
      -- TRNS line (main transaction)
      RETURN QUERY SELECT format(
        'TRNS	INVOICE	%s	Accounts Receivable	%s	%s	%s',
        TO_CHAR((v_export_data->>'invoice_date')::date, 'MM/DD/YYYY'),
        COALESCE(REPLACE(v_export_data->>'customer_name', E'\t', ' '), 'Customer'),
        (v_export_data->>'amount')::numeric * -1, -- Negative for AR increase
        COALESCE('Invoice ' || (v_export_data->>'invoice_number'), '')
      )::text;
      
      -- SPL line (revenue)
      RETURN QUERY SELECT format(
        'SPL	INVOICE	%s	%s	%s	%s	%s',
        TO_CHAR((v_export_data->>'invoice_date')::date, 'MM/DD/YYYY'),
        v_account,
        COALESCE(REPLACE(v_export_data->>'customer_name', E'\t', ' '), 'Customer'),
        v_export_data->>'amount',
        COALESCE('Job: ' || (v_export_data->>'job_number'), '')
      )::text;
      
      -- ENDTRNS
      RETURN QUERY SELECT 'ENDTRNS'::text;
    END IF;
  END LOOP;
  
  -- Export payments (as deposits)
  FOR v_payment IN
    SELECT q.*, p.id as source_id
    FROM public.accounting_sync_queue q
    JOIN public.job_payments p ON p.id = q.source_id
    WHERE q.org_id = p_org_id
      AND q.sync_type = 'payment'
      AND (p_start_date IS NULL OR p.created_at::date >= p_start_date)
      AND (p_end_date IS NULL OR p.created_at::date <= p_end_date)
      AND q.status IN ('pending', 'synced')
    ORDER BY p.created_at
  LOOP
    v_export_data := public.prepare_payment_export_data(v_payment.source_id);
    IF v_export_data IS NOT NULL THEN
      -- Get revenue account
      SELECT accounting_account INTO v_account
      FROM public.accounting_revenue_categories
      WHERE category_key = v_export_data->>'revenue_category'
        AND is_active = true
      LIMIT 1;
      
      IF v_account IS NULL THEN
        v_account := 'Income.Retail';
      END IF;
      
      -- TRNS line (deposit)
      RETURN QUERY SELECT format(
        'TRNS	DEPOSIT	%s	Undeposited Funds	%s	%s	%s',
        TO_CHAR((v_export_data->>'payment_date')::date, 'MM/DD/YYYY'),
        COALESCE(REPLACE(v_export_data->>'customer_name', E'\t', ' '), 'Customer'),
        v_export_data->>'amount',
        COALESCE('Payment for ' || (v_export_data->>'invoice_number'), '')
      )::text;
      
      -- SPL line (revenue)
      RETURN QUERY SELECT format(
        'SPL	DEPOSIT	%s	%s	%s	%s	%s',
        TO_CHAR((v_export_data->>'payment_date')::date, 'MM/DD/YYYY'),
        v_account,
        COALESCE(REPLACE(v_export_data->>'customer_name', E'\t', ' '), 'Customer'),
        (v_export_data->>'amount')::numeric * -1,
        COALESCE('Job: ' || (v_export_data->>'job_number'), '')
      )::text;
      
      -- ENDTRNS
      RETURN QUERY SELECT 'ENDTRNS'::text;
    END IF;
  END LOOP;
  
  -- Export costs (as checks/bills)
  FOR v_cost IN
    SELECT q.*, c.id as source_id
    FROM public.accounting_sync_queue q
    JOIN public.job_cost_entries c ON c.id = q.source_id
    WHERE q.org_id = p_org_id
      AND q.sync_type = 'cost_entry'
      AND (p_start_date IS NULL OR c.cost_date >= p_start_date)
      AND (p_end_date IS NULL OR c.cost_date <= p_end_date)
      AND q.status IN ('pending', 'synced')
    ORDER BY c.cost_date
  LOOP
    v_export_data := public.prepare_cost_export_data(v_cost.source_id);
    IF v_export_data IS NOT NULL THEN
      v_account := v_export_data->>'accounting_account';
      
      -- TRNS line (check/bill)
      RETURN QUERY SELECT format(
        'TRNS	CHECK	%s	%s	%s	%s	%s',
        TO_CHAR((v_export_data->>'cost_date')::date, 'MM/DD/YYYY'),
        v_account,
        COALESCE(REPLACE(v_export_data->>'vendor', E'\t', ' '), 'Vendor'),
        (v_export_data->>'amount')::numeric * -1,
        COALESCE(REPLACE(v_export_data->>'description', E'\t', ' '), '')
      )::text;
      
      -- SPL line (expense)
      RETURN QUERY SELECT format(
        'SPL	CHECK	%s	%s	%s	%s	%s',
        TO_CHAR((v_export_data->>'cost_date')::date, 'MM/DD/YYYY'),
        v_account,
        COALESCE(REPLACE(v_export_data->>'vendor', E'\t', ' '), 'Vendor'),
        v_export_data->>'amount',
        COALESCE('Job: ' || (v_export_data->>'job_number'), '')
      )::text;
      
      -- ENDTRNS
      RETURN QUERY SELECT 'ENDTRNS'::text;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.export_to_quickbooks_desktop_iif IS 'Block 25580: Exports accounting data to QuickBooks Desktop IIF format';

-- ============================================================================
-- PART 15 — TRIGGERS: Auto-queue sync on invoice/payment/cost creation
-- ============================================================================

-- Trigger function for invoices
CREATE OR REPLACE FUNCTION public.trigger_queue_invoice_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get org_id from invoice
  v_org_id := NEW.org_id;
  
  -- Queue sync
  PERFORM public.queue_accounting_sync(
    v_org_id,
    (SELECT workspace_id FROM public.roofing_jobs WHERE id = NEW.job_id LIMIT 1),
    'invoice',
    'job_invoice',
    NEW.id,
    'csv'
  );
  
  -- Categorize revenue
  UPDATE public.job_invoices
  SET accounting_revenue_category = public.categorize_revenue(
    NEW.job_id,
    NEW.id,
    NULL,
    NEW.payment_type
  ),
  accounting_job_id = 'JOB-' || substring(NEW.job_id::text, 1, 8)
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_queue_invoice_sync
  AFTER INSERT ON public.job_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_invoice_sync();

-- Trigger function for payments
CREATE OR REPLACE FUNCTION public.trigger_queue_payment_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get org_id from payment
  v_org_id := NEW.org_id;
  
  -- Queue sync
  PERFORM public.queue_accounting_sync(
    v_org_id,
    (SELECT workspace_id FROM public.roofing_jobs WHERE id = NEW.job_id LIMIT 1),
    'payment',
    'job_payment',
    NEW.id,
    'csv'
  );
  
  -- Categorize revenue
  UPDATE public.job_payments
  SET accounting_revenue_category = public.categorize_revenue(
    NEW.job_id,
    NEW.invoice_id,
    NEW.id,
    NEW.payment_type
  )
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_queue_payment_sync
  AFTER INSERT ON public.job_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_payment_sync();

-- Trigger function for cost entries
CREATE OR REPLACE FUNCTION public.trigger_queue_cost_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get org_id (try to find from workspace)
  SELECT om.org_id INTO v_org_id
  FROM public.org_memberships om
  JOIN public.workspace_members wm ON wm.user_id = om.user_id
  WHERE wm.workspace_id = NEW.workspace_id
  LIMIT 1;
  
  IF v_org_id IS NOT NULL THEN
    -- Queue sync
    PERFORM public.queue_accounting_sync(
      v_org_id,
      NEW.workspace_id,
      'cost_entry',
      'job_cost_entry',
      NEW.id,
      'csv'
    );
    
    -- Map to accounting account
    UPDATE public.job_cost_entries
    SET accounting_cost_account = public.map_cost_to_accounting(
      v_org_id,
      NEW.workspace_id,
      NEW.category
    )
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_queue_cost_sync
  AFTER INSERT ON public.job_cost_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_cost_sync();

-- ============================================================================
-- PART 16 — CREATE ACCOUNTING DASHBOARD VIEWS
-- ============================================================================

-- View: Revenue This Month
CREATE OR REPLACE VIEW public.accounting_revenue_this_month AS
SELECT 
  w.id as workspace_id,
  o.id as org_id,
  COALESCE(SUM(p.amount), 0) as total_revenue,
  COALESCE(SUM(p.amount) FILTER (WHERE p.accounting_revenue_category = 'retail_roof'), 0) as retail_revenue,
  COALESCE(SUM(p.amount) FILTER (WHERE p.accounting_revenue_category = 'insurance_acv'), 0) as insurance_acv_revenue,
  COALESCE(SUM(p.amount) FILTER (WHERE p.accounting_revenue_category = 'insurance_depreciation'), 0) as insurance_depreciation_revenue,
  COALESCE(SUM(p.amount) FILTER (WHERE p.accounting_revenue_category = 'supplements'), 0) as supplement_revenue,
  COALESCE(SUM(p.amount) FILTER (WHERE p.accounting_revenue_category = 'repairs'), 0) as repair_revenue,
  COUNT(DISTINCT p.job_id) as jobs_with_payments,
  COUNT(DISTINCT p.id) as payment_count
FROM public.workspaces w
LEFT JOIN public.organizations o ON o.id IN (
  SELECT om.org_id FROM public.org_memberships om
  JOIN public.workspace_members wm ON wm.user_id = om.user_id
  WHERE wm.workspace_id = w.id
  LIMIT 1
)
LEFT JOIN public.roofing_jobs rj ON rj.workspace_id = w.id
LEFT JOIN public.job_payments p ON p.job_id = rj.id
  AND p.created_at >= date_trunc('month', current_date)
WHERE w.id IS NOT NULL
GROUP BY w.id, o.id;

COMMENT ON VIEW public.accounting_revenue_this_month IS 'Block 25580: Revenue summary for current month by workspace';

-- View: COGS Breakdown
CREATE OR REPLACE VIEW public.accounting_cogs_breakdown AS
SELECT 
  w.id as workspace_id,
  o.id as org_id,
  COALESCE(SUM(ce.amount) FILTER (WHERE ce.category = 'materials'), 0) as material_costs,
  COALESCE(SUM(ce.amount) FILTER (WHERE ce.category = 'labor'), 0) as labor_costs,
  COALESCE(SUM(ce.amount) FILTER (WHERE ce.category = 'dumpster'), 0) as dump_costs,
  COALESCE(SUM(ce.amount) FILTER (WHERE ce.category = 'permits'), 0) as permit_costs,
  COALESCE(SUM(ce.amount) FILTER (WHERE ce.category = 'equipment'), 0) as equipment_costs,
  COALESCE(SUM(ce.amount) FILTER (WHERE ce.category NOT IN ('materials', 'labor', 'dumpster', 'permits', 'equipment')), 0) as other_costs,
  COALESCE(SUM(ce.amount), 0) as total_cogs
FROM public.workspaces w
LEFT JOIN public.organizations o ON o.id IN (
  SELECT om.org_id FROM public.org_memberships om
  JOIN public.workspace_members wm ON wm.user_id = om.user_id
  WHERE wm.workspace_id = w.id
  LIMIT 1
)
LEFT JOIN public.job_cost_entries ce ON ce.workspace_id = w.id
WHERE w.id IS NOT NULL
GROUP BY w.id, o.id;

COMMENT ON VIEW public.accounting_cogs_breakdown IS 'Block 25580: COGS breakdown by category (Material, Labor, Dump, etc.)';

-- View: Accounts Receivable
CREATE OR REPLACE VIEW public.accounting_accounts_receivable AS
SELECT 
  w.id as workspace_id,
  o.id as org_id,
  rj.id as job_id,
  rj.title as job_title,
  COALESCE(SUM(i.amount), 0) - COALESCE(SUM(p.amount), 0) as outstanding_balance,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status IN ('sent', 'viewed', 'overdue')) as unpaid_invoices,
  MAX(i.due_date) FILTER (WHERE i.status IN ('sent', 'viewed', 'overdue')) as oldest_due_date
FROM public.workspaces w
LEFT JOIN public.organizations o ON o.id IN (
  SELECT om.org_id FROM public.org_memberships om
  JOIN public.workspace_members wm ON wm.user_id = om.user_id
  WHERE wm.workspace_id = w.id
  LIMIT 1
)
LEFT JOIN public.roofing_jobs rj ON rj.workspace_id = w.id
LEFT JOIN public.job_invoices i ON i.job_id = rj.id
LEFT JOIN public.job_payments p ON p.job_id = rj.id
WHERE w.id IS NOT NULL
  AND (COALESCE(SUM(i.amount), 0) - COALESCE(SUM(p.amount), 0)) > 0
GROUP BY w.id, o.id, rj.id, rj.title;

COMMENT ON VIEW public.accounting_accounts_receivable IS 'Block 25580: Accounts Receivable by job';

-- View: Insurance Checks Pending
CREATE OR REPLACE VIEW public.accounting_insurance_checks_pending AS
SELECT 
  w.id as workspace_id,
  o.id as org_id,
  rj.id as job_id,
  rj.title as job_title,
  ic.carrier_name,
  ic.claim_number,
  ic.acv_amount - ic.acv_paid as acv_pending,
  ic.depreciation_amount - ic.rcv_paid as depreciation_pending,
  ic.supplement_requested - ic.supplement_approved as supplement_pending
FROM public.workspaces w
LEFT JOIN public.organizations o ON o.id IN (
  SELECT om.org_id FROM public.org_memberships om
  JOIN public.workspace_members wm ON wm.user_id = om.user_id
  WHERE wm.workspace_id = w.id
  LIMIT 1
)
LEFT JOIN public.roofing_jobs rj ON rj.workspace_id = w.id
LEFT JOIN public.job_insurance_claims ic ON ic.job_id = rj.id
WHERE w.id IS NOT NULL
  AND ic.id IS NOT NULL
  AND (
    (ic.acv_amount - ic.acv_paid) > 0
    OR (ic.depreciation_amount - ic.rcv_paid) > 0
    OR (ic.supplement_requested - ic.supplement_approved) > 0
  );

COMMENT ON VIEW public.accounting_insurance_checks_pending IS 'Block 25580: Insurance checks pending (ACV, Depreciation, Supplements)';

-- ============================================================================
-- PART 17 — FUNCTION: get_accounting_dashboard_summary
-- ============================================================================
-- Returns complete accounting dashboard data

CREATE OR REPLACE FUNCTION public.get_accounting_dashboard_summary(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_revenue jsonb;
  v_cogs jsonb;
  v_ar numeric;
  v_ap numeric;
  v_profit_margin numeric;
BEGIN
  -- Get revenue this month
  SELECT jsonb_build_object(
    'total', total_revenue,
    'retail', retail_revenue,
    'insurance_acv', insurance_acv_revenue,
    'insurance_depreciation', insurance_depreciation_revenue,
    'supplements', supplement_revenue,
    'repairs', repair_revenue,
    'jobs_with_payments', jobs_with_payments,
    'payment_count', payment_count
  ) INTO v_revenue
  FROM public.accounting_revenue_this_month
  WHERE org_id = p_org_id
  LIMIT 1;
  
  -- Get COGS breakdown
  SELECT jsonb_build_object(
    'material', material_costs,
    'labor', labor_costs,
    'dump', dump_costs,
    'permits', permit_costs,
    'equipment', equipment_costs,
    'other', other_costs,
    'total', total_cogs
  ) INTO v_cogs
  FROM public.accounting_cogs_breakdown
  WHERE org_id = p_org_id
  LIMIT 1;
  
  -- Get Accounts Receivable total
  SELECT COALESCE(SUM(outstanding_balance), 0) INTO v_ar
  FROM public.accounting_accounts_receivable
  WHERE org_id = p_org_id;
  
  -- Get Accounts Payable (material costs not yet paid - simplified)
  SELECT COALESCE(SUM(amount), 0) INTO v_ap
  FROM public.job_cost_entries ce
  JOIN public.roofing_jobs rj ON rj.id = ce.job_id
  JOIN public.workspaces w ON w.id = rj.workspace_id
  JOIN public.org_memberships om ON om.user_id IN (
    SELECT user_id FROM public.workspace_members WHERE workspace_id = w.id LIMIT 1
  )
  WHERE om.org_id = p_org_id
    AND ce.category = 'materials';
  
  -- Calculate profit margin
  IF (v_revenue->>'total')::numeric > 0 THEN
    v_profit_margin := ((v_revenue->>'total')::numeric - (v_cogs->>'total')::numeric) / (v_revenue->>'total')::numeric * 100;
  ELSE
    v_profit_margin := 0;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'revenue', COALESCE(v_revenue, '{}'::jsonb),
    'cogs', COALESCE(v_cogs, '{}'::jsonb),
    'accounts_receivable', v_ar,
    'accounts_payable', v_ap,
    'profit_margin_pct', v_profit_margin,
    'insurance_checks_pending', (
      SELECT jsonb_agg(jsonb_build_object(
        'job_id', job_id,
        'job_title', job_title,
        'carrier', carrier_name,
        'claim_number', claim_number,
        'acv_pending', acv_pending,
        'depreciation_pending', depreciation_pending,
        'supplement_pending', supplement_pending
      ))
      FROM public.accounting_insurance_checks_pending
      WHERE org_id = p_org_id
    )
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_accounting_dashboard_summary IS 'Block 25580: Returns complete accounting dashboard summary for an organization';

-- ============================================================================
-- PART 18 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.accounting_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_customer_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_revenue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_cost_mapping ENABLE ROW LEVEL SECURITY;

-- Sync queue policies
CREATE POLICY "Users can view sync queue in their org"
  ON public.accounting_sync_queue FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can manage sync queue in their org"
  ON public.accounting_sync_queue FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Sync log policies
CREATE POLICY "Users can view sync log in their org"
  ON public.accounting_sync_log FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Customer mapping policies
CREATE POLICY "Users can view customer mapping in their org"
  ON public.accounting_customer_mapping FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can manage customer mapping in their org"
  ON public.accounting_customer_mapping FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Revenue categories policies
CREATE POLICY "Users can view revenue categories"
  ON public.accounting_revenue_categories FOR SELECT
  USING (
    org_id IS NULL OR org_id IN (
      SELECT org_id FROM public.org_memberships 
      WHERE user_id = auth.uid() AND status = 'active'
    )
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage revenue categories in their org"
  ON public.accounting_revenue_categories FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Cost mapping policies
CREATE POLICY "Users can view cost mapping"
  ON public.accounting_cost_mapping FOR SELECT
  USING (
    org_id IS NULL OR org_id IN (
      SELECT org_id FROM public.org_memberships 
      WHERE user_id = auth.uid() AND status = 'active'
    )
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage cost mapping in their org"
  ON public.accounting_cost_mapping FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================================
-- PART 19 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.accounting_sync_queue TO authenticated;
GRANT SELECT ON public.accounting_sync_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accounting_customer_mapping TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accounting_revenue_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accounting_cost_mapping TO authenticated;

GRANT SELECT ON public.accounting_revenue_this_month TO authenticated;
GRANT SELECT ON public.accounting_cogs_breakdown TO authenticated;
GRANT SELECT ON public.accounting_accounts_receivable TO authenticated;
GRANT SELECT ON public.accounting_insurance_checks_pending TO authenticated;

GRANT EXECUTE ON FUNCTION public.categorize_revenue(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_cost_to_accounting(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_accounting_sync(uuid, uuid, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_invoice_export_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_payment_export_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_cost_export_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_to_csv(uuid, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_to_quickbooks_desktop_iif(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accounting_dashboard_summary(uuid) TO authenticated;

-- ============================================================================
-- PART 20 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.accounting_sync_queue IS 'Block 25580: Queue of records waiting to be synced to accounting systems';
COMMENT ON TABLE public.accounting_sync_log IS 'Block 25580: Audit log of all accounting sync operations';
COMMENT ON TABLE public.accounting_customer_mapping IS 'Block 25580: Maps SmartSend contacts to accounting system customers';
COMMENT ON TABLE public.accounting_revenue_categories IS 'Block 25580: Roofing-specific revenue categories (Retail, ACV, Depreciation, Supplements, etc.)';
COMMENT ON TABLE public.accounting_cost_mapping IS 'Block 25580: Maps cost categories to accounting COGS accounts (Material, Labor, Dump, etc.)';




































