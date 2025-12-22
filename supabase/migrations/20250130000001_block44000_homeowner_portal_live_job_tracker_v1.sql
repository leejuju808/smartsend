-- ============================================================
-- Block 44000 — SmartSend Roofing "Homeowner Portal + Live Job Tracker" v1
-- (LIVE JOB UPDATES • PHOTO FEED • CHANGE ORDERS • MESSAGING • PAYMENT LINK)
-- ============================================================
-- 
-- This block shocks homeowners and makes roofers look elite — which directly 
-- increases close rates, 5-star reviews, and referrals.
--
-- Features:
-- - Secure Homeowner Login (Magic Link)
-- - Live Job Status with real-time stages
-- - Photo Feed (Before → During → After)
-- - Live Timeline Feed (FedEx-style tracking)
-- - Change Order Approval System
-- - Messaging (Homeowner ↔ Office)
-- - Payment Link Integration (Stripe)
-- ============================================================

-- ============================================================
-- 1. HOMEOWNERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.homeowners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  email text NOT NULL,
  name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowners_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowners
        ADD CONSTRAINT homeowners_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowners_job_id ON public.homeowners(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowners_email ON public.homeowners(email);

-- ============================================================
-- 2. HOMEOWNER_SESSIONS TABLE (Magic Links)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.homeowner_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid NOT NULL REFERENCES public.homeowners(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_sessions_token ON public.homeowner_sessions(token);
CREATE INDEX IF NOT EXISTS idx_homeowner_sessions_homeowner ON public.homeowner_sessions(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_sessions_expires ON public.homeowner_sessions(expires_at);

-- ============================================================
-- 3. HOMEOWNER_MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.homeowner_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  sender text NOT NULL CHECK (sender IN ('homeowner', 'office')),
  message text NOT NULL,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_messages_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_messages
        ADD CONSTRAINT homeowner_messages_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_messages_job ON public.homeowner_messages(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_homeowner_messages_homeowner ON public.homeowner_messages(homeowner_id);

-- ============================================================
-- 4. HOMEOWNER_CHANGE_ORDER_ACTION TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.homeowner_change_order_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL,
  homeowner_id uuid NOT NULL REFERENCES public.homeowners(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approved', 'declined')),
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to change_orders if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'change_orders') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_change_order_action_co_fkey'
    ) THEN
      ALTER TABLE public.homeowner_change_order_action
        ADD CONSTRAINT homeowner_change_order_action_co_fkey
        FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_co_action_co ON public.homeowner_change_order_action(change_order_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_co_action_homeowner ON public.homeowner_change_order_action(homeowner_id);

-- ============================================================
-- 5. JOB STATUS STAGES ENUM (if not exists)
-- ============================================================
-- Add job_status_stage column to roofing_jobs if it doesn't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'roofing_jobs' 
      AND column_name = 'homeowner_status'
    ) THEN
      ALTER TABLE public.roofing_jobs 
        ADD COLUMN homeowner_status text DEFAULT 'scheduled' 
        CHECK (homeowner_status IN (
          'scheduled',
          'crew_en_route',
          'in_progress',
          'mid_install',
          'cleanup',
          'completed',
          'inspection',
          'final_walkthrough'
        ));
      
      CREATE INDEX IF NOT EXISTS idx_roofing_jobs_homeowner_status ON public.roofing_jobs(homeowner_status);
    END IF;
  END IF;
END $$;

-- ============================================================
-- 6. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Homeowners table
ALTER TABLE public.homeowners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowners_select_workspace"
  ON public.homeowners FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.roofing_jobs
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

CREATE POLICY "homeowners_insert_workspace"
  ON public.homeowners FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.roofing_jobs
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

-- Homeowner sessions - public read for edge function
ALTER TABLE public.homeowner_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_sessions_public_read"
  ON public.homeowner_sessions FOR SELECT
  USING (true);

CREATE POLICY "homeowner_sessions_insert_workspace"
  ON public.homeowner_sessions FOR INSERT
  WITH CHECK (
    homeowner_id IN (
      SELECT id FROM public.homeowners
      WHERE job_id IN (
        SELECT id FROM public.roofing_jobs
        WHERE workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

-- Homeowner messages - public read/write for edge function
ALTER TABLE public.homeowner_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_messages_public_all"
  ON public.homeowner_messages FOR ALL
  USING (true)
  WITH CHECK (true);

-- Homeowner change order actions - public read/write for edge function
ALTER TABLE public.homeowner_change_order_action ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_co_action_public_all"
  ON public.homeowner_change_order_action FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 7. GRANT PERMISSIONS
-- ============================================================
GRANT SELECT, INSERT ON public.homeowners TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_sessions TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_messages TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_change_order_action TO authenticated;

-- Public access for edge functions
GRANT SELECT, INSERT ON public.homeowner_sessions TO anon;
GRANT SELECT, INSERT ON public.homeowner_messages TO anon;
GRANT SELECT, INSERT ON public.homeowner_change_order_action TO anon;

-- ============================================================
-- 8. HELPER FUNCTION: CREATE MAGIC LINK TOKEN
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_homeowner_magic_link(
  p_homeowner_id uuid,
  p_expires_in_hours int DEFAULT 24
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token text;
  v_expires_at timestamptz;
BEGIN
  -- Generate secure token
  v_token := encode(gen_random_bytes(32), 'base64url');
  v_expires_at := now() + (p_expires_in_hours || ' hours')::interval;
  
  -- Insert session
  INSERT INTO public.homeowner_sessions (homeowner_id, token, expires_at)
  VALUES (p_homeowner_id, v_token, v_expires_at)
  ON CONFLICT (token) DO NOTHING;
  
  -- If conflict, generate new token
  IF NOT FOUND THEN
    v_token := encode(gen_random_bytes(32), 'base64url');
    INSERT INTO public.homeowner_sessions (homeowner_id, token, expires_at)
    VALUES (p_homeowner_id, v_token, v_expires_at);
  END IF;
  
  RETURN v_token;
END;
$$;

-- ============================================================
-- 9. TRIGGER: AUTO-UPDATE CHANGE ORDER STATUS ON HOMEOWNER ACTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_change_order_on_homeowner_action()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- When homeowner approves/declines, update change order status
  IF NEW.action = 'approved' THEN
    UPDATE public.change_orders
    SET 
      status = 'approved',
      approved_at = now()
    WHERE id = NEW.change_order_id
    AND status = 'pending';
  ELSIF NEW.action = 'declined' THEN
    UPDATE public.change_orders
    SET 
      status = 'rejected',
      rejected_at = now()
    WHERE id = NEW.change_order_id
    AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_change_order_on_homeowner_action ON public.homeowner_change_order_action;
CREATE TRIGGER trg_update_change_order_on_homeowner_action
AFTER INSERT ON public.homeowner_change_order_action
FOR EACH ROW
EXECUTE FUNCTION public.update_change_order_on_homeowner_action();

-- ============================================================
-- 10. COMMENTS
-- ============================================================
COMMENT ON TABLE public.homeowners IS 'Block 44000: Homeowner records linked to jobs for portal access';
COMMENT ON TABLE public.homeowner_sessions IS 'Block 44000: Magic link sessions for secure homeowner login';
COMMENT ON TABLE public.homeowner_messages IS 'Block 44000: Messages between homeowners and office';
COMMENT ON TABLE public.homeowner_change_order_action IS 'Block 44000: Homeowner approvals/declines for change orders';
COMMENT ON FUNCTION public.create_homeowner_magic_link(uuid, int) IS 'Block 44000: Creates a secure magic link token for homeowner portal access';
































