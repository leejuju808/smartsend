-- =========================================================
-- Block 52000 — SmartSend Roofing "Warranty Tracking + Service Call System" v1
-- (WARRANTY REGISTRY • WARRANTY EXPIRATION ENGINE • SERVICE REQUEST TICKETS • TECH DISPATCH • PHOTO-PROOF FIXES • HOMEOWNER PORTAL INTEGRATION)
-- =========================================================
-- 
-- This block is MASSIVE because it extends SmartSend beyond the installation into the next 5–10 years of the homeowner relationship.
--
-- Roofers rarely track warranties correctly. They lose money on:
-- - unnecessary service calls
-- - expired warranties they still honor
-- - untracked workmanship warranties
-- - missing documentation
-- - homeowner disputes
-- - not upselling maintenance programs
--
-- This block fixes ALL that.
--
-- SmartSend becomes the warranty brain of the company.

-- ============================================================================
-- PART 1 — CREATE warranties TABLE
-- ============================================================================
-- Warranty Registry: Auto-generated when job passes QC
-- Tracks every warranty with full details for proper management

CREATE TABLE IF NOT EXISTS public.warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  homeowner_id uuid,
  workspace_id uuid NOT NULL,
  
  -- Installation details
  install_date date NOT NULL DEFAULT current_date,
  expiration_date date NOT NULL,
  workmanship_years integer DEFAULT 5,
  
  -- Material and manufacturer info
  shingle_type text,
  manufacturer_info jsonb DEFAULT '{}'::jsonb, -- {brand: text, model: text, warranty_years: int, warranty_number: text}
  
  -- Quality control reference
  qc_score numeric(5,2),
  qc_inspection_id uuid,
  
  -- Closeout packet reference
  closeout_packet_id uuid,
  
  -- Material summary
  material_summary jsonb DEFAULT '{}'::jsonb, -- {shingles: text, underlayment: text, ventilation: text, etc}
  
  -- Address (denormalized for quick access)
  address text,
  
  -- Warranty status tracking
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'voided')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'warranties_job_id_fkey'
    ) THEN
      ALTER TABLE public.warranties
        ADD CONSTRAINT warranties_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'homeowners') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'warranties_homeowner_id_fkey'
    ) THEN
      ALTER TABLE public.warranties
        ADD CONSTRAINT warranties_homeowner_id_fkey
        FOREIGN KEY (homeowner_id) REFERENCES public.homeowners(id) ON DELETE SET NULL;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'warranties_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.warranties
        ADD CONSTRAINT warranties_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'qc_inspections') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'warranties_qc_inspection_id_fkey'
    ) THEN
      ALTER TABLE public.warranties
        ADD CONSTRAINT warranties_qc_inspection_id_fkey
        FOREIGN KEY (qc_inspection_id) REFERENCES public.qc_inspections(id) ON DELETE SET NULL;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'closeout_packets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'warranties_closeout_packet_id_fkey'
    ) THEN
      ALTER TABLE public.warranties
        ADD CONSTRAINT warranties_closeout_packet_id_fkey
        FOREIGN KEY (closeout_packet_id) REFERENCES public.closeout_packets(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_warranties_job ON public.warranties(job_id);
CREATE INDEX IF NOT EXISTS idx_warranties_homeowner ON public.warranties(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_workspace ON public.warranties(workspace_id);
CREATE INDEX IF NOT EXISTS idx_warranties_expiration ON public.warranties(expiration_date);
CREATE INDEX IF NOT EXISTS idx_warranties_status ON public.warranties(status);
CREATE INDEX IF NOT EXISTS idx_warranties_active ON public.warranties(expiration_date) WHERE status = 'active' AND expiration_date >= current_date;

COMMENT ON TABLE public.warranties IS 'Block 52000: Warranty registry for completed roofing jobs';
COMMENT ON COLUMN public.warranties.workmanship_years IS 'Block 52000: Workmanship warranty duration in years';
COMMENT ON COLUMN public.warranties.manufacturer_info IS 'Block 52000: Manufacturer warranty details (brand, model, warranty_years, warranty_number)';
COMMENT ON COLUMN public.warranties.qc_score IS 'Block 52000: QC inspection score when warranty was created';

-- ============================================================================
-- PART 2 — CREATE service_tickets TABLE
-- ============================================================================
-- Service Call Tickets: Tracks homeowner service requests and warranty repairs

CREATE TABLE IF NOT EXISTS public.service_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  homeowner_id uuid,
  warranty_id uuid,
  workspace_id uuid NOT NULL,
  
  -- Ticket details
  ticket_number text UNIQUE, -- Auto-generated: ST-YYYYMMDD-XXXX
  category text NOT NULL CHECK (category IN ('leak', 'missing_shingle', 'vent_issue', 'flashing_issue', 'gutter_issue', 'other')),
  description text NOT NULL,
  
  -- Homeowner photos
  homeowner_photos text[] DEFAULT '{}',
  
  -- Warranty status classification
  warranty_status text NOT NULL DEFAULT 'in_warranty' CHECK (warranty_status IN (
    'in_warranty',
    'out_of_warranty',
    'fee_required',
    'covered'
  )),
  
  -- Urgency level
  urgency text DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high')),
  
  -- Status workflow
  status text DEFAULT 'open' CHECK (status IN (
    'open',
    'assigned',
    'in_progress',
    'completed',
    'closed',
    'cancelled'
  )),
  
  -- Technician assignment
  technician_id uuid,
  
  -- Scheduling
  scheduled_date date,
  scheduled_time time,
  
  -- Completion tracking
  completed_at timestamptz,
  closed_at timestamptz,
  
  -- Notes
  notes text,
  internal_notes text, -- Owner-only notes
  
  -- Costing (for out-of-warranty work)
  labor_hours numeric(5,2),
  material_cost numeric(10,2),
  total_cost numeric(10,2),
  invoice_required boolean DEFAULT false,
  invoice_id uuid, -- Reference to invoice if created
  
  -- Homeowner confirmation
  homeowner_confirmed boolean DEFAULT false,
  homeowner_rating integer CHECK (homeowner_rating >= 1 AND homeowner_rating <= 5),
  homeowner_feedback text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_tickets_job_id_fkey'
    ) THEN
      ALTER TABLE public.service_tickets
        ADD CONSTRAINT service_tickets_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'homeowners') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_tickets_homeowner_id_fkey'
    ) THEN
      ALTER TABLE public.service_tickets
        ADD CONSTRAINT service_tickets_homeowner_id_fkey
        FOREIGN KEY (homeowner_id) REFERENCES public.homeowners(id) ON DELETE SET NULL;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warranties') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_tickets_warranty_id_fkey'
    ) THEN
      ALTER TABLE public.service_tickets
        ADD CONSTRAINT service_tickets_warranty_id_fkey
        FOREIGN KEY (warranty_id) REFERENCES public.warranties(id) ON DELETE SET NULL;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_tickets_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.service_tickets
        ADD CONSTRAINT service_tickets_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crew_members') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_tickets_technician_id_fkey'
    ) THEN
      ALTER TABLE public.service_tickets
        ADD CONSTRAINT service_tickets_technician_id_fkey
        FOREIGN KEY (technician_id) REFERENCES public.crew_members(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_tickets_job ON public.service_tickets(job_id);
CREATE INDEX IF NOT EXISTS idx_service_tickets_homeowner ON public.service_tickets(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_warranty ON public.service_tickets(warranty_id) WHERE warranty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_workspace ON public.service_tickets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_service_tickets_status ON public.service_tickets(status);
CREATE INDEX IF NOT EXISTS idx_service_tickets_urgency ON public.service_tickets(urgency) WHERE status IN ('open', 'assigned', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_service_tickets_technician ON public.service_tickets(technician_id) WHERE technician_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_warranty_status ON public.service_tickets(warranty_status);
CREATE INDEX IF NOT EXISTS idx_service_tickets_ticket_number ON public.service_tickets(ticket_number) WHERE ticket_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_created ON public.service_tickets(created_at DESC);

COMMENT ON TABLE public.service_tickets IS 'Block 52000: Service call tickets for warranty repairs and homeowner requests';
COMMENT ON COLUMN public.service_tickets.warranty_status IS 'Block 52000: Whether service is covered under warranty (in_warranty, out_of_warranty, fee_required, covered)';
COMMENT ON COLUMN public.service_tickets.urgency IS 'Block 52000: Urgency level (low, medium, high)';

-- ============================================================================
-- PART 3 — CREATE service_ticket_logs TABLE
-- ============================================================================
-- Activity log for service tickets (who did what, when)

CREATE TABLE IF NOT EXISTS public.service_ticket_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  message text NOT NULL,
  action_type text CHECK (action_type IN (
    'created',
    'assigned',
    'status_changed',
    'note_added',
    'photo_added',
    'completed',
    'closed'
  )),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_tickets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_ticket_logs_ticket_id_fkey'
    ) THEN
      ALTER TABLE public.service_ticket_logs
        ADD CONSTRAINT service_ticket_logs_ticket_id_fkey
        FOREIGN KEY (ticket_id) REFERENCES public.service_tickets(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_ticket_logs_ticket ON public.service_ticket_logs(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_ticket_logs_user ON public.service_ticket_logs(user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.service_ticket_logs IS 'Block 52000: Activity log for service tickets';

-- ============================================================================
-- PART 4 — CREATE service_ticket_fixes TABLE
-- ============================================================================
-- Technician fix documentation with photos and materials

CREATE TABLE IF NOT EXISTS public.service_ticket_fixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  technician_id uuid,
  
  -- Fix documentation
  fix_photos text[] DEFAULT '{}',
  fix_description text,
  
  -- Materials used
  materials_used jsonb DEFAULT '[]'::jsonb, -- [{name: text, quantity: numeric, unit: text, cost: numeric}]
  
  -- Labor tracking
  labor_hours numeric(5,2),
  start_time timestamptz,
  end_time timestamptz,
  
  -- Completion
  completed_at timestamptz DEFAULT now(),
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- Add foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_tickets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_ticket_fixes_ticket_id_fkey'
    ) THEN
      ALTER TABLE public.service_ticket_fixes
        ADD CONSTRAINT service_ticket_fixes_ticket_id_fkey
        FOREIGN KEY (ticket_id) REFERENCES public.service_tickets(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crew_members') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_ticket_fixes_technician_id_fkey'
    ) THEN
      ALTER TABLE public.service_ticket_fixes
        ADD CONSTRAINT service_ticket_fixes_technician_id_fkey
        FOREIGN KEY (technician_id) REFERENCES public.crew_members(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_ticket_fixes_ticket ON public.service_ticket_fixes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_ticket_fixes_technician ON public.service_ticket_fixes(technician_id) WHERE technician_id IS NOT NULL;

COMMENT ON TABLE public.service_ticket_fixes IS 'Block 52000: Technician fix documentation with photos and materials';

-- ============================================================================
-- PART 5 — FUNCTION: Generate ticket number
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_service_ticket_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text := 'ST-';
  v_date text := to_char(now(), 'YYYYMMDD');
  v_seq integer;
  v_ticket_number text;
BEGIN
  -- Get next sequence number for today
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM '[0-9]+$') AS integer)), 0) + 1
  INTO v_seq
  FROM public.service_tickets
  WHERE ticket_number LIKE v_prefix || v_date || '-%';
  
  -- Format: ST-YYYYMMDD-XXXX
  v_ticket_number := v_prefix || v_date || '-' || LPAD(v_seq::text, 4, '0');
  
  RETURN v_ticket_number;
END;
$$;

COMMENT ON FUNCTION public.generate_service_ticket_number IS 'Block 52000: Generates unique service ticket number (ST-YYYYMMDD-XXXX)';

-- ============================================================================
-- PART 6 — TRIGGER: Auto-generate ticket number
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_service_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := public.generate_service_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_service_ticket_number ON public.service_tickets;
CREATE TRIGGER trg_set_service_ticket_number
  BEFORE INSERT ON public.service_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_service_ticket_number();

-- ============================================================================
-- PART 7 — TRIGGER: Auto-create warranty when QC passes
-- ============================================================================
-- Creates warranty automatically when QC inspection is completed with passing score

CREATE OR REPLACE FUNCTION public.create_warranty_on_qc_pass()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_warranty_id uuid;
  v_job record;
  v_homeowner_id uuid;
  v_closeout_packet_id uuid;
  v_install_date date;
  v_expiration_date date;
  v_workmanship_years integer := 5;
BEGIN
  -- Only trigger when QC status changes to 'completed' and score passes threshold
  IF NEW.status = 'completed' 
     AND (OLD.status IS NULL OR OLD.status != 'completed')
     AND NEW.score >= NEW.pass_threshold THEN
    
    -- Check if warranty already exists for this job
    SELECT id INTO v_warranty_id
    FROM public.warranties
    WHERE job_id = NEW.job_id;
    
    -- Only create if warranty doesn't exist
    IF v_warranty_id IS NULL THEN
      -- Get job details
      SELECT 
        rj.id,
        rj.workspace_id,
        rj.lead_id,
        rj.scheduled_end_date,
        rj.scheduled_start_date
      INTO v_job
      FROM public.roofing_jobs rj
      WHERE rj.id = NEW.job_id;
      
      IF NOT FOUND THEN
        RETURN NEW;
      END IF;
      
      -- Get homeowner_id from homeowners table
      SELECT id INTO v_homeowner_id
      FROM public.homeowners
      WHERE job_id = NEW.job_id
      LIMIT 1;
      
      -- Get closeout_packet_id if exists
      SELECT id INTO v_closeout_packet_id
      FROM public.closeout_packets
      WHERE job_id = NEW.job_id
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- Determine install date (use scheduled_end_date or today)
      v_install_date := COALESCE(v_job.scheduled_end_date::date, current_date);
      
      -- Calculate expiration date (workmanship_years from install date)
      v_expiration_date := v_install_date + (v_workmanship_years || ' years')::interval;
      
      -- Create warranty record
      INSERT INTO public.warranties (
        job_id,
        homeowner_id,
        workspace_id,
        install_date,
        expiration_date,
        workmanship_years,
        qc_score,
        qc_inspection_id,
        closeout_packet_id,
        status
      )
      VALUES (
        NEW.job_id,
        v_homeowner_id,
        v_job.workspace_id,
        v_install_date,
        v_expiration_date,
        v_workmanship_years,
        NEW.score,
        NEW.id,
        v_closeout_packet_id,
        'active'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_warranty_on_qc_pass ON public.qc_inspections;
CREATE TRIGGER trg_create_warranty_on_qc_pass
  AFTER UPDATE ON public.qc_inspections
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.create_warranty_on_qc_pass();

COMMENT ON FUNCTION public.create_warranty_on_qc_pass IS 'Block 52000: Automatically creates warranty when QC inspection passes';

-- ============================================================================
-- PART 8 — FUNCTION: Calculate warranty days remaining
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_warranty_days_remaining(p_warranty_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_expiration_date date;
  v_days_remaining integer;
BEGIN
  SELECT expiration_date INTO v_expiration_date
  FROM public.warranties
  WHERE id = p_warranty_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  v_days_remaining := v_expiration_date - current_date;
  
  RETURN v_days_remaining;
END;
$$;

COMMENT ON FUNCTION public.calculate_warranty_days_remaining IS 'Block 52000: Calculates days remaining until warranty expiration';

-- ============================================================================
-- PART 9 — FUNCTION: Check warranty expiration and update status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_warranty_expirations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count integer := 0;
BEGIN
  -- Update expired warranties
  UPDATE public.warranties
  SET 
    status = 'expired',
    updated_at = now()
  WHERE status = 'active'
    AND expiration_date < current_date;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN v_updated_count;
END;
$$;

COMMENT ON FUNCTION public.check_warranty_expirations IS 'Block 52000: Checks and updates expired warranty statuses (run daily)';

-- ============================================================================
-- PART 10 — FUNCTION: Classify service ticket warranty status
-- ============================================================================
-- Warranty Rules Engine: Determines if service is covered

CREATE OR REPLACE FUNCTION public.classify_service_ticket_warranty_status(
  p_ticket_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
  v_warranty record;
  v_days_remaining integer;
  v_warranty_status text;
BEGIN
  -- Get ticket and warranty info
  SELECT 
    st.*,
    w.id as warranty_id,
    w.expiration_date,
    w.status as warranty_status,
    w.workmanship_years,
    w.install_date
  INTO v_ticket
  FROM public.service_tickets st
  LEFT JOIN public.warranties w ON w.job_id = st.job_id AND w.status = 'active'
  WHERE st.id = p_ticket_id;
  
  IF NOT FOUND THEN
    RETURN 'out_of_warranty';
  END IF;
  
  -- If no warranty exists, it's out of warranty
  IF v_ticket.warranty_id IS NULL THEN
    RETURN 'out_of_warranty';
  END IF;
  
  -- Check if warranty is expired
  IF v_ticket.expiration_date < current_date OR v_ticket.warranty_status != 'active' THEN
    RETURN 'out_of_warranty';
  END IF;
  
  -- Calculate days remaining
  v_days_remaining := v_ticket.expiration_date - current_date;
  
  -- If in warranty and active, it's covered
  -- (Future: Add logic for fee_required based on issue type, maintenance records, etc.)
  RETURN 'in_warranty';
END;
$$;

COMMENT ON FUNCTION public.classify_service_ticket_warranty_status IS 'Block 52000: Warranty rules engine - classifies if service ticket is covered under warranty';

-- ============================================================================
-- PART 11 — TRIGGER: Auto-classify warranty status on ticket creation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_classify_ticket_warranty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_classified_status text;
BEGIN
  -- Only classify if not already set or if it's the default
  IF NEW.warranty_status = 'in_warranty' OR NEW.warranty_status IS NULL THEN
    v_classified_status := public.classify_service_ticket_warranty_status(NEW.id);
    
    -- Set warranty_id if found
    IF v_classified_status = 'in_warranty' THEN
      SELECT id INTO NEW.warranty_id
      FROM public.warranties
      WHERE job_id = NEW.job_id
        AND status = 'active'
        AND expiration_date >= current_date
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;
    
    NEW.warranty_status := v_classified_status;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_classify_ticket_warranty ON public.service_tickets;
CREATE TRIGGER trg_auto_classify_ticket_warranty
  BEFORE INSERT ON public.service_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_classify_ticket_warranty();

-- ============================================================================
-- PART 12 — TRIGGER: Log service ticket activity
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_service_ticket_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_message text;
  v_action_type text;
BEGIN
  -- Determine action type and message
  IF TG_OP = 'INSERT' THEN
    v_action_type := 'created';
    v_message := 'Service ticket created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action_type := 'status_changed';
      v_message := 'Status changed from ' || COALESCE(OLD.status, 'null') || ' to ' || NEW.status;
    ELSIF OLD.technician_id IS DISTINCT FROM NEW.technician_id THEN
      v_action_type := 'assigned';
      v_message := 'Ticket assigned to technician';
    ELSE
      v_action_type := 'note_added';
      v_message := 'Ticket updated';
    END IF;
  END IF;
  
  -- Insert log entry
  INSERT INTO public.service_ticket_logs (
    ticket_id,
    message,
    action_type,
    user_id,
    metadata
  )
  VALUES (
    NEW.id,
    v_message,
    v_action_type,
    auth.uid(),
    jsonb_build_object(
      'old_status', OLD.status,
      'new_status', NEW.status,
      'old_technician_id', OLD.technician_id,
      'new_technician_id', NEW.technician_id
    )
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_service_ticket_activity ON public.service_tickets;
CREATE TRIGGER trg_log_service_ticket_activity
  AFTER INSERT OR UPDATE ON public.service_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.log_service_ticket_activity();

-- ============================================================================
-- PART 13 — TRIGGERS: Update updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_warranty_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warranties_updated_at
  BEFORE UPDATE ON public.warranties
  FOR EACH ROW
  EXECUTE FUNCTION public.set_warranty_updated_at();

CREATE TRIGGER trg_service_tickets_updated_at
  BEFORE UPDATE ON public.service_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_warranty_updated_at();

-- ============================================================================
-- PART 14 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_ticket_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_ticket_fixes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view warranties in their workspace
CREATE POLICY "Users can view warranties in their workspace"
  ON public.warranties FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can manage warranties in their workspace
CREATE POLICY "Users can manage warranties in their workspace"
  ON public.warranties FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Homeowners can view their own warranties (via homeowner portal)
CREATE POLICY "Homeowners can view their own warranties"
  ON public.warranties FOR SELECT
  USING (
    homeowner_id IN (
      SELECT id FROM public.homeowners
      WHERE id = warranties.homeowner_id
      -- Note: Homeowner portal authentication would be handled separately
    )
  );

-- Policy: Users can view service tickets in their workspace
CREATE POLICY "Users can view service tickets in their workspace"
  ON public.service_tickets FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can manage service tickets in their workspace
CREATE POLICY "Users can manage service tickets in their workspace"
  ON public.service_tickets FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Homeowners can view and create their own service tickets
CREATE POLICY "Homeowners can view their own service tickets"
  ON public.service_tickets FOR SELECT
  USING (
    homeowner_id IN (
      SELECT id FROM public.homeowners
      WHERE id = service_tickets.homeowner_id
    )
  );

CREATE POLICY "Homeowners can create their own service tickets"
  ON public.service_tickets FOR INSERT
  WITH CHECK (
    homeowner_id IN (
      SELECT id FROM public.homeowners
      WHERE id = service_tickets.homeowner_id
    )
  );

-- Policy: Users can view service ticket logs in their workspace
CREATE POLICY "Users can view service ticket logs in their workspace"
  ON public.service_ticket_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = service_ticket_logs.ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: System can create service ticket logs
CREATE POLICY "System can create service ticket logs"
  ON public.service_ticket_logs FOR INSERT
  WITH CHECK (true);

-- Policy: Users can view service ticket fixes in their workspace
CREATE POLICY "Users can view service ticket fixes in their workspace"
  ON public.service_ticket_fixes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = service_ticket_fixes.ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can manage service ticket fixes in their workspace
CREATE POLICY "Users can manage service ticket fixes in their workspace"
  ON public.service_ticket_fixes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = service_ticket_fixes.ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = service_ticket_fixes.ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- PART 15 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_ticket_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_ticket_fixes TO authenticated;

GRANT EXECUTE ON FUNCTION public.generate_service_ticket_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_warranty_days_remaining(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_warranty_expirations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_service_ticket_warranty_status(uuid) TO authenticated;
































