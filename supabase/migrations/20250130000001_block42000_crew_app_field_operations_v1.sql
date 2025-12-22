-- Block 42000 — SmartSend Roofing "Crew App + Field Operations Mobile System" v1
-- (DAILY JOB CARDS • FIELD PHOTOS • START/STOP TIME • PUNCH LISTS • CHANGE ORDERS • MATERIAL REPORTING • OFFLINE MODE)
-- 
-- This block turns SmartSend into a true contractor weapon because NOW the owner sees everything crews do
-- without texting, calling, or chasing anyone.

-- ============================================================
-- 1. CREWS TABLE (if not exists, enhance if exists)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crews_workspace ON public.crews(workspace_id, is_active);

-- ============================================================
-- 2. CREW_MEMBERS TABLE (enhance existing if needed)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text DEFAULT 'member',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add user_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'crew_members' 
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.crew_members ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_members_workspace ON public.crew_members(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON public.crew_members(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crew_members_user ON public.crew_members(user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 3. ENHANCE JOBS TABLE (add scheduled_date and crew_id)
-- ============================================================
-- Add scheduled_date to roofing_jobs if it doesn't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'roofing_jobs' 
      AND column_name = 'scheduled_date'
    ) THEN
      ALTER TABLE public.roofing_jobs ADD COLUMN scheduled_date date;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'roofing_jobs' 
      AND column_name = 'crew_id'
    ) THEN
      ALTER TABLE public.roofing_jobs ADD COLUMN crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_roofing_jobs_crew ON public.roofing_jobs(crew_id) WHERE crew_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_roofing_jobs_scheduled_date ON public.roofing_jobs(scheduled_date) WHERE scheduled_date IS NOT NULL;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 4. JOB_ACTIVITY_LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('start', 'pause', 'stop', 'photo', 'material', 'punch', 'change_order')),
  payload jsonb DEFAULT '{}'::jsonb,
  gps_latitude numeric(10, 8),
  gps_longitude numeric(11, 8),
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_activity_log_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_activity_log
        ADD CONSTRAINT job_activity_log_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_activity_log_job ON public.job_activity_log(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_activity_log_member ON public.job_activity_log(member_id);
CREATE INDEX IF NOT EXISTS idx_job_activity_log_type ON public.job_activity_log(type);

-- ============================================================
-- 5. JOB_PHOTOS TABLE (enhance existing if needed)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('before', 'during', 'after', 'issue')),
  url text NOT NULL,
  storage_path text,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_photos_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_photos
        ADD CONSTRAINT job_photos_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Add member_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'job_photos' 
    AND column_name = 'member_id'
  ) THEN
    ALTER TABLE public.job_photos ADD COLUMN member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'job_photos' 
    AND column_name = 'category'
  ) THEN
    ALTER TABLE public.job_photos ADD COLUMN category text CHECK (category IN ('before', 'during', 'after', 'issue'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_photos_job ON public.job_photos(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_photos_category ON public.job_photos(category);
CREATE INDEX IF NOT EXISTS idx_job_photos_member ON public.job_photos(member_id);

-- ============================================================
-- 6. PUNCH_LIST TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.punch_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  description text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'needs_attention', 'needs_material', 'needs_qc')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'punch_list_job_id_fkey'
    ) THEN
      ALTER TABLE public.punch_list
        ADD CONSTRAINT punch_list_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_punch_list_job ON public.punch_list(job_id, status);
CREATE INDEX IF NOT EXISTS idx_punch_list_status ON public.punch_list(status);

-- ============================================================
-- 7. CHANGE_ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  description text NOT NULL,
  photo_id uuid REFERENCES public.job_photos(id) ON DELETE SET NULL,
  suggested_price numeric(12, 2),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'change_orders_job_id_fkey'
    ) THEN
      ALTER TABLE public.change_orders
        ADD CONSTRAINT change_orders_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_change_orders_job ON public.change_orders(job_id, status);
CREATE INDEX IF NOT EXISTS idx_change_orders_status ON public.change_orders(status);

-- ============================================================
-- 8. MATERIAL_USAGE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.material_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  material_name text NOT NULL,
  quantity numeric(10, 2) NOT NULL,
  unit text DEFAULT 'each',
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'material_usage_job_id_fkey'
    ) THEN
      ALTER TABLE public.material_usage
        ADD CONSTRAINT material_usage_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_material_usage_job ON public.material_usage(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_usage_material ON public.material_usage(material_name);

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_usage ENABLE ROW LEVEL SECURITY;

-- Crews: Workspace members can access
DROP POLICY IF EXISTS "crews_workspace_member" ON public.crews;
CREATE POLICY "crews_workspace_member" ON public.crews
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = crews.workspace_id AND user_id = auth.uid()
    )
  );

-- Crew members: Workspace members can access
DROP POLICY IF EXISTS "crew_members_workspace_member" ON public.crew_members;
CREATE POLICY "crew_members_workspace_member" ON public.crew_members
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = crew_members.workspace_id AND user_id = auth.uid()
    )
  );

-- Job activity log: Access via job's workspace
DROP POLICY IF EXISTS "job_activity_log_workspace_member" ON public.job_activity_log;
CREATE POLICY "job_activity_log_workspace_member" ON public.job_activity_log
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = job_activity_log.job_id AND wm.user_id = auth.uid()
    )
  );

-- Job photos: Access via job's workspace
DROP POLICY IF EXISTS "job_photos_workspace_member" ON public.job_photos;
CREATE POLICY "job_photos_workspace_member" ON public.job_photos
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = job_photos.job_id AND wm.user_id = auth.uid()
    )
  );

-- Punch list: Access via job's workspace
DROP POLICY IF EXISTS "punch_list_workspace_member" ON public.punch_list;
CREATE POLICY "punch_list_workspace_member" ON public.punch_list
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = punch_list.job_id AND wm.user_id = auth.uid()
    )
  );

-- Change orders: Access via job's workspace
DROP POLICY IF EXISTS "change_orders_workspace_member" ON public.change_orders;
CREATE POLICY "change_orders_workspace_member" ON public.change_orders
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = change_orders.job_id AND wm.user_id = auth.uid()
    )
  );

-- Material usage: Access via job's workspace
DROP POLICY IF EXISTS "material_usage_workspace_member" ON public.material_usage;
CREATE POLICY "material_usage_workspace_member" ON public.material_usage
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = material_usage.job_id AND wm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 10. HELPER FUNCTIONS
-- ============================================================

-- Get today's jobs for a crew member
CREATE OR REPLACE FUNCTION get_crew_today_jobs(p_member_id uuid)
RETURNS TABLE (
  job_id uuid,
  job_title text,
  address text,
  scheduled_date date,
  start_time text,
  scope_summary text,
  special_instructions text,
  required_photos text[],
  materials_list jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rj.id as job_id,
    COALESCE(rj.title, rj.job_name, 'Untitled Job') as job_title,
    COALESCE(rj.address, 'No address') as address,
    rj.scheduled_date,
    NULL::text as start_time, -- Can be enhanced later
    rj.notes as scope_summary,
    NULL::text as special_instructions, -- Can be enhanced later
    ARRAY['before', 'during', 'after']::text[] as required_photos,
    '[]'::jsonb as materials_list -- Can be enhanced later
  FROM public.roofing_jobs rj
  JOIN public.crew_members cm ON rj.crew_id = cm.crew_id
  WHERE cm.id = p_member_id
    AND rj.scheduled_date = CURRENT_DATE
    AND rj.status IN ('scheduled', 'in_progress')
  ORDER BY rj.scheduled_date, rj.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get job activity feed
CREATE OR REPLACE FUNCTION get_job_activity_feed(p_job_id uuid, p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  type text,
  member_name text,
  payload jsonb,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    jal.id,
    jal.type,
    COALESCE(cm.name, 'Unknown') as member_name,
    jal.payload,
    jal.created_at
  FROM public.job_activity_log jal
  LEFT JOIN public.crew_members cm ON jal.member_id = cm.id
  WHERE jal.job_id = p_job_id
  ORDER BY jal.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;































