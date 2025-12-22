-- Block 242 — Team Sharing v1 RLS Policies
-- Update RLS policies to include shared_items access

-- Helper function to check if user has shared access to an item
CREATE OR REPLACE FUNCTION public.has_shared_access(
  p_item_type text,
  p_item_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_required_access text DEFAULT 'view'
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shared_items si
    WHERE si.item_type = p_item_type
      AND si.item_id = p_item_id
      AND si.target_user_id = p_user_id
      AND (
        p_required_access = 'view'
        OR (p_required_access = 'edit' AND si.access IN ('view', 'edit'))
      )
  );
$$;

-- ============================================================================
-- CAMPAIGNS
-- ============================================================================
-- Update campaigns SELECT policy to include shared items
-- Note: This assumes campaigns table has user_id column (most common pattern)
-- If your campaigns table uses a different ownership column, adjust accordingly

DO $$
BEGIN
  -- Check if campaigns table exists and has user_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'campaigns' 
    AND column_name = 'user_id'
  ) THEN
    -- Drop existing select policies (if they exist)
    DROP POLICY IF EXISTS "campaigns_select_own" ON public.campaigns;
    DROP POLICY IF EXISTS "campaigns_select_shared" ON public.campaigns;
    
    -- Create new policy that includes shared items
    CREATE POLICY "campaigns_select_own_or_shared" ON public.campaigns
      FOR SELECT USING (
        user_id = auth.uid()
        OR public.has_shared_access('campaign', id, auth.uid(), 'view')
      );
  END IF;
END $$;

-- Update campaigns UPDATE policy to include shared items with edit access
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'campaigns' 
    AND column_name = 'user_id'
  ) THEN
    DROP POLICY IF EXISTS "campaigns_update_own" ON public.campaigns;
    
    CREATE POLICY "campaigns_update_own_or_shared" ON public.campaigns
      FOR UPDATE USING (
        user_id = auth.uid()
        OR public.has_shared_access('campaign', id, auth.uid(), 'edit')
      )
      WITH CHECK (
        user_id = auth.uid()
        OR public.has_shared_access('campaign', id, auth.uid(), 'edit')
      );
  END IF;
END $$;

-- ============================================================================
-- SEGMENTS (segment_definitions)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'segment_definitions'
  ) THEN
    ALTER TABLE public.segment_definitions ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "segment_definitions_select_own" ON public.segment_definitions;
    DROP POLICY IF EXISTS "segment_definitions_select_shared" ON public.segment_definitions;
    
    CREATE POLICY "segment_definitions_select_own_or_shared" ON public.segment_definitions
      FOR SELECT USING (
        owner_id = auth.uid()
        OR public.has_shared_access('segment', id, auth.uid(), 'view')
      );
    
    DROP POLICY IF EXISTS "segment_definitions_update_own" ON public.segment_definitions;
    
    CREATE POLICY "segment_definitions_update_own_or_shared" ON public.segment_definitions
      FOR UPDATE USING (
        owner_id = auth.uid()
        OR public.has_shared_access('segment', id, auth.uid(), 'edit')
      )
      WITH CHECK (
        owner_id = auth.uid()
        OR public.has_shared_access('segment', id, auth.uid(), 'edit')
      );
  END IF;
END $$;

-- ============================================================================
-- TEMPLATES
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'templates'
  ) THEN
    ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
    
    -- Check which ownership column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'templates' 
      AND column_name = 'created_by'
    ) THEN
      -- Templates with created_by column
      DROP POLICY IF EXISTS "templates_select_own" ON public.templates;
      DROP POLICY IF EXISTS "templates_select_shared" ON public.templates;
      
      CREATE POLICY "templates_select_own_or_shared" ON public.templates
        FOR SELECT USING (
          created_by = auth.uid()
          OR public.has_shared_access('template', id, auth.uid(), 'view')
        );
      
      DROP POLICY IF EXISTS "templates_update_own" ON public.templates;
      
      CREATE POLICY "templates_update_own_or_shared" ON public.templates
        FOR UPDATE USING (
          created_by = auth.uid()
          OR public.has_shared_access('template', id, auth.uid(), 'edit')
        )
        WITH CHECK (
          created_by = auth.uid()
          OR public.has_shared_access('template', id, auth.uid(), 'edit')
        );
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'templates' 
      AND column_name = 'owner_id'
    ) THEN
      -- Templates with owner_id column
      DROP POLICY IF EXISTS "templates_select_own" ON public.templates;
      DROP POLICY IF EXISTS "templates_select_shared" ON public.templates;
      
      CREATE POLICY "templates_select_own_or_shared" ON public.templates
        FOR SELECT USING (
          owner_id = auth.uid()
          OR public.has_shared_access('template', id, auth.uid(), 'view')
        );
      
      DROP POLICY IF EXISTS "templates_update_own" ON public.templates;
      
      CREATE POLICY "templates_update_own_or_shared" ON public.templates
        FOR UPDATE USING (
          owner_id = auth.uid()
          OR public.has_shared_access('template', id, auth.uid(), 'edit')
        )
        WITH CHECK (
          owner_id = auth.uid()
          OR public.has_shared_access('template', id, auth.uid(), 'edit')
        );
    END IF;
  END IF;
END $$;

-- ============================================================================
-- SAVED_VIEWS (lead views)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'saved_views'
  ) THEN
    ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
    
    -- Update SELECT policy to include shared items
    -- Note: saved_views already has complex RLS, so we'll add shared_items as an OR condition
    DROP POLICY IF EXISTS "saved_views_select_shared" ON public.saved_views;
    
    -- Add a policy specifically for shared items
    CREATE POLICY "saved_views_select_shared" ON public.saved_views
      FOR SELECT USING (
        public.has_shared_access('lead_view', id, auth.uid(), 'view')
      );
    
    -- Update UPDATE policy to include shared items with edit access
    DROP POLICY IF EXISTS "saved_views_update_shared" ON public.saved_views;
    
    CREATE POLICY "saved_views_update_shared" ON public.saved_views
      FOR UPDATE USING (
        public.has_shared_access('lead_view', id, auth.uid(), 'edit')
      )
      WITH CHECK (
        public.has_shared_access('lead_view', id, auth.uid(), 'edit')
      );
  END IF;
END $$;










