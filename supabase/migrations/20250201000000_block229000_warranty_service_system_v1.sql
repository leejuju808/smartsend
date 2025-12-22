-- ============================================================
-- Block 229000 — SmartSend Roofing "Warranty Manager + Service Ticket System" v1
-- (LIFETIME CUSTOMER ENGINE)
-- ============================================================
-- 
-- This block takes SmartSend beyond "sales + production" and into customer retention,
-- repeat revenue, and long-term brand dominance.
--
-- Every roofing company bleeds money by:
-- ❌ Not tracking warranties
-- ❌ Missing follow-up opportunities
-- ❌ Losing long-term work (repairs, additions, upgrades)
-- ❌ Forgetting to schedule maintenance
-- ❌ Ignoring small service calls that turn into big jobs
-- ❌ Having no system for customer lifetime value
--
-- SmartSend fixes ALL OF IT and makes roofers feel:
-- "We are a REAL company now. Every roofer not using SmartSend is working like it's 1999."
--
-- This is where SmartSend becomes an ecosystem, not an app.
-- ============================================================

-- ============================================================
-- 1. WARRANTIES TABLE
-- ============================================================
-- Created when contract is signed or manually added
-- Tracks warranty coverage, expiration, and documents

CREATE TABLE IF NOT EXISTS public.warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  
  -- Warranty details
  warranty_type text NOT NULL CHECK (warranty_type IN (
    'workmanship',
    'manufacturer',
    'extended',
    'labor_only',
    'material_only'
  )),
  start_date date NOT NULL,
  end_date date NOT NULL,
  
  -- Documentation
  document_url text, -- PDF or HTML link
  coverage_description text,
  
  -- Status
  is_active boolean DEFAULT true,
  expires_soon boolean DEFAULT false, -- Set by trigger when < 30 days
  
  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'warranties_job_id_fkey'
    ) THEN
      ALTER TABLE public.warranties
        ADD CONSTRAINT warranties_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'warranties_job_id_fkey'
    ) THEN
      ALTER TABLE public.warranties
        ADD CONSTRAINT warranties_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_warranties_workspace ON public.warranties(workspace_id);
CREATE INDEX IF NOT EXISTS idx_warranties_job ON public.warranties(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_homeowner ON public.warranties(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_end_date ON public.warranties(end_date);
CREATE INDEX IF NOT EXISTS idx_warranties_active ON public.warranties(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_warranties_expires_soon ON public.warranties(expires_soon) WHERE expires_soon = true;

-- ============================================================
-- 2. SERVICE_TICKETS TABLE
-- ============================================================
-- A customer-submitted or office-created service request

CREATE TABLE IF NOT EXISTS public.service_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  job_id uuid,
  warranty_id uuid REFERENCES public.warranties(id) ON DELETE SET NULL,
  
  -- Ticket details
  ticket_number text UNIQUE, -- Auto-generated: "ST-2025-001"
  ticket_type text NOT NULL CHECK (ticket_type IN (
    'leak',
    'shingle_missing',
    'gutter_issue',
    'siding',
    'inspection',
    'warranty_check',
    'repair',
    'maintenance',
    'other'
  )),
  description text NOT NULL,
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text DEFAULT 'open' CHECK (status IN (
    'open',
    'scheduled',
    'in_progress',
    'completed',
    'closed',
    'cancelled'
  )),
  
  -- Customer info
  customer_name text,
  customer_phone text,
  customer_email text,
  property_address text,
  
  -- Scheduling
  requested_date date,
  scheduled_date date,
  completed_date date,
  
  -- Financial
  is_warranty_covered boolean DEFAULT false,
  estimated_cost numeric(12,2),
  actual_cost numeric(12,2),
  change_order_created boolean DEFAULT false,
  change_order_id uuid, -- Reference to change order if created
  
  -- Meta
  created_by text DEFAULT 'customer', -- 'customer' or 'office'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_tickets_job_id_fkey'
    ) THEN
      ALTER TABLE public.service_tickets
        ADD CONSTRAINT service_tickets_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_tickets_job_id_fkey'
    ) THEN
      ALTER TABLE public.service_tickets
        ADD CONSTRAINT service_tickets_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_tickets_workspace ON public.service_tickets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_service_tickets_homeowner ON public.service_tickets(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_job ON public.service_tickets(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_warranty ON public.service_tickets(warranty_id) WHERE warranty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_status ON public.service_tickets(status);
CREATE INDEX IF NOT EXISTS idx_service_tickets_priority ON public.service_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_service_tickets_scheduled_date ON public.service_tickets(scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_ticket_number ON public.service_tickets(ticket_number);

-- ============================================================
-- 3. SERVICE_ATTACHMENTS TABLE
-- ============================================================
-- Photos & documentation for service tickets

CREATE TABLE IF NOT EXISTS public.service_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  notes text,
  attachment_type text DEFAULT 'photo' CHECK (attachment_type IN ('photo', 'document', 'video')),
  uploaded_by text, -- 'customer' or 'crew' or 'office'
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_attachments_ticket ON public.service_attachments(ticket_id);

-- ============================================================
-- 4. SERVICE_ASSIGNMENTS TABLE
-- ============================================================
-- Crew assignments for service calls

CREATE TABLE IF NOT EXISTS public.service_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  scheduled_date date NOT NULL,
  scheduled_time time,
  status text DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'en_route',
    'on_site',
    'completed',
    'cancelled'
  )),
  
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_assignments_ticket ON public.service_assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_assignments_crew ON public.service_assignments(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_assignments_scheduled_date ON public.service_assignments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_service_assignments_status ON public.service_assignments(status);

-- ============================================================
-- 5. SERVICE_LOGS TABLE
-- ============================================================
-- Crew field logs for service work

CREATE TABLE IF NOT EXISTS public.service_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  notes text,
  resolution text,
  work_performed text,
  materials_used text,
  
  completed boolean DEFAULT false,
  completed_at timestamptz,
  
  -- Upsell opportunity
  upsell_opportunity boolean DEFAULT false,
  upsell_description text,
  upsell_estimated_value numeric(12,2),
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_logs_ticket ON public.service_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_logs_crew ON public.service_logs(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_logs_completed ON public.service_logs(completed);

-- ============================================================
-- 6. HELPER FUNCTIONS
-- ============================================================

-- Generate ticket number
CREATE OR REPLACE FUNCTION generate_service_ticket_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  year_part text;
  seq_num integer;
  ticket_num text;
BEGIN
  year_part := TO_CHAR(now(), 'YYYY');
  
  -- Get next sequence number for this year
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 8) AS integer)), 0) + 1
  INTO seq_num
  FROM public.service_tickets
  WHERE ticket_number LIKE 'ST-' || year_part || '-%';
  
  ticket_num := 'ST-' || year_part || '-' || LPAD(seq_num::text, 3, '0');
  RETURN ticket_num;
END;
$$;

-- Auto-generate ticket number on insert
CREATE OR REPLACE FUNCTION set_service_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := generate_service_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_service_ticket_number
  BEFORE INSERT ON public.service_tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_service_ticket_number();

-- Update warranty expires_soon flag
CREATE OR REPLACE FUNCTION update_warranty_expires_soon()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set expires_soon to true if warranty expires within 30 days
  IF NEW.end_date <= CURRENT_DATE + INTERVAL '30 days' AND NEW.is_active = true THEN
    NEW.expires_soon := true;
  ELSE
    NEW.expires_soon := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_warranty_expires_soon
  BEFORE INSERT OR UPDATE ON public.warranties
  FOR EACH ROW
  EXECUTE FUNCTION update_warranty_expires_soon();

-- Auto-update service ticket status when assignment is created
CREATE OR REPLACE FUNCTION auto_update_ticket_status_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- When assignment is created, update ticket status to 'scheduled'
  IF NEW.status = 'scheduled' THEN
    UPDATE public.service_tickets
    SET status = 'scheduled',
        scheduled_date = NEW.scheduled_date,
        updated_at = now()
    WHERE id = NEW.ticket_id AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_update_ticket_status_on_assignment
  AFTER INSERT ON public.service_assignments
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_ticket_status_on_assignment();

-- Auto-update ticket status when service log is completed
CREATE OR REPLACE FUNCTION auto_update_ticket_status_on_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- When service log is marked completed, update ticket status
  IF NEW.completed = true AND NEW.completed_at IS NOT NULL THEN
    UPDATE public.service_tickets
    SET status = 'completed',
        completed_date = CURRENT_DATE,
        updated_at = now()
    WHERE id = NEW.ticket_id AND status IN ('in_progress', 'scheduled');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_update_ticket_status_on_completion
  AFTER UPDATE ON public.service_logs
  FOR EACH ROW
  WHEN (OLD.completed = false AND NEW.completed = true)
  EXECUTE FUNCTION auto_update_ticket_status_on_completion();

-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Warranties
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warranties_select_workspace"
  ON public.warranties FOR SELECT
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

CREATE POLICY "warranties_insert_workspace"
  ON public.warranties FOR INSERT
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

CREATE POLICY "warranties_update_workspace"
  ON public.warranties FOR UPDATE
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

-- Service tickets
ALTER TABLE public.service_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_tickets_select_workspace"
  ON public.service_tickets FOR SELECT
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

CREATE POLICY "service_tickets_insert_workspace"
  ON public.service_tickets FOR INSERT
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

CREATE POLICY "service_tickets_update_workspace"
  ON public.service_tickets FOR UPDATE
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

-- Service attachments
ALTER TABLE public.service_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_attachments_select_ticket"
  ON public.service_attachments FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM public.service_tickets
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "service_attachments_insert_ticket"
  ON public.service_attachments FOR INSERT
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM public.service_tickets
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

-- Service assignments
ALTER TABLE public.service_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_assignments_select_ticket"
  ON public.service_assignments FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM public.service_tickets
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "service_assignments_insert_ticket"
  ON public.service_assignments FOR INSERT
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM public.service_tickets
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "service_assignments_update_ticket"
  ON public.service_assignments FOR UPDATE
  USING (
    ticket_id IN (
      SELECT id FROM public.service_tickets
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

-- Service logs
ALTER TABLE public.service_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_logs_select_ticket"
  ON public.service_logs FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM public.service_tickets
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "service_logs_insert_ticket"
  ON public.service_logs FOR INSERT
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM public.service_tickets
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "service_logs_update_ticket"
  ON public.service_logs FOR UPDATE
  USING (
    ticket_id IN (
      SELECT id FROM public.service_tickets
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 8. COMMENTS FOR DOCUMENTATION
-- ============================================================

COMMENT ON TABLE public.warranties IS 'Warranty tracking for completed jobs - enables lifetime customer management';
COMMENT ON TABLE public.service_tickets IS 'Service requests from customers or office - the foundation of repeat revenue';
COMMENT ON TABLE public.service_attachments IS 'Photos and documents attached to service tickets';
COMMENT ON TABLE public.service_assignments IS 'Crew assignments for service calls';
COMMENT ON TABLE public.service_logs IS 'Field logs from crews performing service work';

COMMENT ON COLUMN public.warranties.expires_soon IS 'Automatically set to true when warranty expires within 30 days';
COMMENT ON COLUMN public.service_tickets.ticket_number IS 'Auto-generated format: ST-YYYY-###';
COMMENT ON COLUMN public.service_tickets.is_warranty_covered IS 'Whether this service is covered under warranty';
COMMENT ON COLUMN public.service_logs.upsell_opportunity IS 'Flag for potential upsell opportunities discovered during service';

























