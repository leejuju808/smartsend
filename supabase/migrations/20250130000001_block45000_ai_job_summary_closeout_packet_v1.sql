-- =========================================================
-- Block 45000 — SmartSend Roofing "AI Job Summary + Homeowner Closeout Packet" v1
-- (AUTO-GENERATED FINAL REPORT • BEFORE/AFTER PHOTOS • MATERIALS USED • WARRANTY DOCS • WHAT WAS REPLACED • CLEAN PDF DELIVERY)
-- =========================================================
-- 
-- This is a roofing company superpower — the moment the job is done, SmartSend automatically creates 
-- a professional closeout packet that makes homeowners say: "Damn… this company is elite."
--
-- This directly leads to:
-- - more referrals
-- - more 5-star reviews
-- - faster invoice payments
-- - stronger reputation
-- - higher close rates for future jobs
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE closeout_packets TABLE
-- ============================================================================
-- Main table for storing generated closeout packets

CREATE TABLE IF NOT EXISTS public.closeout_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'generating',
    'generated',
    'sent',
    'failed'
  )),
  
  -- Generated content
  pdf_url text, -- URL to PDF in Supabase Storage
  pdf_storage_path text, -- Storage path for PDF
  summary_json jsonb, -- Raw AI-generated summary (structured JSON)
  ai_summary_text text, -- Human-readable AI summary
  
  -- Delivery tracking
  sent_to_homeowner_at timestamptz,
  sent_to_email text, -- Homeowner email address
  homeowner_viewed_at timestamptz,
  homeowner_downloaded_at timestamptz,
  
  -- Error tracking
  error_message text,
  generation_attempts integer DEFAULT 0,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  generated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_closeout_packets_job ON public.closeout_packets(job_id);
CREATE INDEX IF NOT EXISTS idx_closeout_packets_workspace ON public.closeout_packets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_closeout_packets_status ON public.closeout_packets(status) WHERE status IN ('pending', 'generating');
CREATE INDEX IF NOT EXISTS idx_closeout_packets_created ON public.closeout_packets(created_at DESC);

-- ============================================================================
-- PART 2 — CREATE closeout_media TABLE
-- ============================================================================
-- For storing AI outputs & photo grouping

CREATE TABLE IF NOT EXISTS public.closeout_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.closeout_packets(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('before', 'after', 'issue', 'material', 'during')),
  photo_urls text[] NOT NULL DEFAULT '{}',
  photo_ids uuid[], -- References to job_field_photos.id
  captions text[], -- Auto-generated captions for each photo
  ai_description text, -- AI-generated description for this media group
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_closeout_media_packet ON public.closeout_media(packet_id);
CREATE INDEX IF NOT EXISTS idx_closeout_media_category ON public.closeout_media(category);

-- ============================================================================
-- PART 3 — CREATE closeout_materials TABLE
-- ============================================================================
-- Material usage breakdown (estimated vs actual)

CREATE TABLE IF NOT EXISTS public.closeout_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.closeout_packets(id) ON DELETE CASCADE,
  material_name text NOT NULL,
  estimated_quantity numeric(10,2),
  actual_quantity numeric(10,2),
  unit text, -- 'bundles', 'squares', 'sheets', 'rolls', etc.
  difference numeric(10,2) GENERATED ALWAYS AS (
    COALESCE(actual_quantity, 0) - COALESCE(estimated_quantity, 0)
  ) STORED,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_closeout_materials_packet ON public.closeout_materials(packet_id);

-- ============================================================================
-- PART 4 — CREATE closeout_replacements TABLE
-- ============================================================================
-- What was replaced during the job (auto-pulled from job activity + change orders)

CREATE TABLE IF NOT EXISTS public.closeout_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.closeout_packets(id) ON DELETE CASCADE,
  item_description text NOT NULL, -- e.g. "30-year architectural shingles", "6 sheets of OSB decking"
  quantity numeric(10,2),
  unit text,
  reason text, -- Why it was replaced (from change order or job notes)
  photo_urls text[], -- Photos showing the replacement
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_closeout_replacements_packet ON public.closeout_replacements(packet_id);

-- ============================================================================
-- PART 5 — CREATE closeout_change_orders TABLE
-- ============================================================================
-- Change order receipts (each change order becomes a clean line item)

CREATE TABLE IF NOT EXISTS public.closeout_change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.closeout_packets(id) ON DELETE CASCADE,
  change_order_id uuid REFERENCES public.roofing_change_orders(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  photo_urls text[] DEFAULT '{}',
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_closeout_change_orders_packet ON public.closeout_change_orders(packet_id);
CREATE INDEX IF NOT EXISTS idx_closeout_change_orders_co ON public.closeout_change_orders(change_order_id) WHERE change_order_id IS NOT NULL;

-- ============================================================================
-- PART 6 — TRIGGERS
-- ============================================================================

-- Update updated_at on closeout_packets
CREATE OR REPLACE FUNCTION public.set_closeout_packets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_closeout_packets_updated_at ON public.closeout_packets;
CREATE TRIGGER trg_closeout_packets_updated_at
BEFORE UPDATE ON public.closeout_packets
FOR EACH ROW
EXECUTE FUNCTION public.set_closeout_packets_updated_at();

-- ============================================================================
-- PART 7 — AUTO-TRIGGER: Generate closeout when job status = 'completed'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_closeout_packet_generation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_packet_id uuid;
BEGIN
  -- Only trigger when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Check if closeout packet already exists
    SELECT id INTO v_packet_id
    FROM public.closeout_packets
    WHERE job_id = NEW.id
    LIMIT 1;
    
    -- Only create if it doesn't exist
    IF v_packet_id IS NULL THEN
      INSERT INTO public.closeout_packets (
        job_id,
        workspace_id,
        status
      ) VALUES (
        NEW.id,
        NEW.workspace_id,
        'pending'
      );
      
      -- Note: The actual generation will be handled by an edge function
      -- that watches for 'pending' status packets
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_generate_closeout_packet ON public.roofing_jobs;
CREATE TRIGGER trg_auto_generate_closeout_packet
AFTER UPDATE OF status ON public.roofing_jobs
FOR EACH ROW
WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
EXECUTE FUNCTION public.trigger_closeout_packet_generation();

COMMENT ON TRIGGER trg_auto_generate_closeout_packet ON public.roofing_jobs IS 
  'Block 45000: Automatically creates a pending closeout packet when job status changes to completed';

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.closeout_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closeout_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closeout_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closeout_replacements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closeout_change_orders ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view closeout packets for jobs in their workspace
CREATE POLICY "closeout_packets_select_workspace"
  ON public.closeout_packets FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Service role has full access
CREATE POLICY "closeout_packets_service_role_all"
  ON public.closeout_packets FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Policy: Users can insert/update closeout packets in their workspace
CREATE POLICY "closeout_packets_modify_workspace"
  ON public.closeout_packets FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "closeout_packets_update_workspace"
  ON public.closeout_packets FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Similar policies for related tables
CREATE POLICY "closeout_media_select_workspace"
  ON public.closeout_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.closeout_packets cp
      WHERE cp.id = closeout_media.packet_id
      AND (
        cp.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR cp.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "closeout_media_service_role_all"
  ON public.closeout_media FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Apply similar policies to other tables
CREATE POLICY "closeout_materials_select_workspace"
  ON public.closeout_materials FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.closeout_packets cp
      WHERE cp.id = closeout_materials.packet_id
      AND (
        cp.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR cp.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "closeout_materials_service_role_all"
  ON public.closeout_materials FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "closeout_replacements_select_workspace"
  ON public.closeout_replacements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.closeout_packets cp
      WHERE cp.id = closeout_replacements.packet_id
      AND (
        cp.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR cp.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "closeout_replacements_service_role_all"
  ON public.closeout_replacements FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "closeout_change_orders_select_workspace"
  ON public.closeout_change_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.closeout_packets cp
      WHERE cp.id = closeout_change_orders.packet_id
      AND (
        cp.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR cp.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "closeout_change_orders_service_role_all"
  ON public.closeout_change_orders FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.closeout_packets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.closeout_media TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.closeout_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.closeout_replacements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.closeout_change_orders TO authenticated;
































