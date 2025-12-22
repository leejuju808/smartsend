-- =========================================================
-- Block 13200 — SmartSend Multi-Step Campaign Builder v2
-- (The Drag-and-Drop Sequencer That Makes Building Roofing Campaigns Stupid-Easy)
-- =========================================================

-- 1. Extend campaign_steps table with v2 fields
-- Ensure campaign_steps table exists and has all required columns
DO $$
BEGIN
  -- Create campaign_steps if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_steps') THEN
    CREATE TABLE public.campaign_steps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
      step_order integer NOT NULL,
      type text NOT NULL DEFAULT 'email' CHECK (type IN ('email', 'wait', 'condition')),
      subject text,
      body text,
      delay_hours integer NOT NULL DEFAULT 0,
      conditions jsonb DEFAULT '{}'::jsonb,
      personalization_flags jsonb DEFAULT '{}'::jsonb,
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (campaign_id, step_order)
    );
  ELSE
    -- Add missing columns if table exists
    ALTER TABLE public.campaign_steps
      ADD COLUMN IF NOT EXISTS type text DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS delay_hours integer DEFAULT 0,
      ADD COLUMN IF NOT EXISTS conditions jsonb DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS personalization_flags jsonb DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;
    
    -- Update type constraint if needed
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'campaign_steps_type_check'
      ) THEN
        ALTER TABLE public.campaign_steps
          ADD CONSTRAINT campaign_steps_type_check 
          CHECK (type IN ('email', 'wait', 'condition'));
      END IF;
    END $$;
    
    -- Migrate existing delay_days/offset_days to delay_hours if needed
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campaign_steps' AND column_name = 'delay_days'
      ) THEN
        UPDATE public.campaign_steps
        SET delay_hours = COALESCE(delay_days, 0) * 24
        WHERE delay_hours = 0 AND delay_days IS NOT NULL;
      END IF;
      
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campaign_steps' AND column_name = 'offset_days'
      ) THEN
        UPDATE public.campaign_steps
        SET delay_hours = COALESCE(offset_days, 0) * 24
        WHERE delay_hours = 0 AND offset_days IS NOT NULL;
      END IF;
    END $$;
  END IF;
END $$;

-- Ensure step_order column exists (may be step_no in older migrations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'campaign_steps' AND column_name = 'step_order'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'campaign_steps' AND column_name = 'step_no'
    ) THEN
      ALTER TABLE public.campaign_steps RENAME COLUMN step_no TO step_order;
    ELSE
      ALTER TABLE public.campaign_steps ADD COLUMN step_order integer;
      -- Set step_order based on existing id ordering
      UPDATE public.campaign_steps
      SET step_order = sub.row_num
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY created_at) as row_num
        FROM public.campaign_steps
      ) sub
      WHERE public.campaign_steps.id = sub.id;
      ALTER TABLE public.campaign_steps ALTER COLUMN step_order SET NOT NULL;
    END IF;
  END IF;
END $$;

-- Ensure subject and body columns exist (may have different names)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'campaign_steps' AND column_name = 'subject'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'campaign_steps' AND column_name = 'subject_template'
    ) THEN
      ALTER TABLE public.campaign_steps RENAME COLUMN subject_template TO subject;
    ELSE
      ALTER TABLE public.campaign_steps ADD COLUMN subject text;
    END IF;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'campaign_steps' AND column_name = 'body'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'campaign_steps' AND column_name = 'body_html_template'
    ) THEN
      ALTER TABLE public.campaign_steps RENAME COLUMN body_html_template TO body;
    ELSE IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'campaign_steps' AND column_name = 'body_template'
    ) THEN
      ALTER TABLE public.campaign_steps RENAME COLUMN body_template TO body;
    ELSE
      ALTER TABLE public.campaign_steps ADD COLUMN body text;
    END IF;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_campaign_steps_campaign_order 
  ON public.campaign_steps(campaign_id, step_order);

CREATE INDEX IF NOT EXISTS idx_campaign_steps_type 
  ON public.campaign_steps(campaign_id, type);

-- Enable RLS
ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies (scope by workspace via campaigns)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_steps' 
    AND policyname = 'campaign_steps_select_own'
  ) THEN
    CREATE POLICY campaign_steps_select_own ON public.campaign_steps
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = campaign_steps.campaign_id
          AND EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = c.workspace_id
            AND wm.user_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_steps' 
    AND policyname = 'campaign_steps_insert_own'
  ) THEN
    CREATE POLICY campaign_steps_insert_own ON public.campaign_steps
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = campaign_steps.campaign_id
          AND EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = c.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'sender')
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_steps' 
    AND policyname = 'campaign_steps_update_own'
  ) THEN
    CREATE POLICY campaign_steps_update_own ON public.campaign_steps
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = campaign_steps.campaign_id
          AND EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = c.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'sender')
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_steps' 
    AND policyname = 'campaign_steps_delete_own'
  ) THEN
    CREATE POLICY campaign_steps_delete_own ON public.campaign_steps
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = campaign_steps.campaign_id
          AND EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = c.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'sender')
          )
        )
      );
  END IF;
END $$;

-- 2. Create campaign_drafts table for autosave
CREATE TABLE IF NOT EXISTS public.campaign_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_drafts_unique 
  ON public.campaign_drafts(campaign_id, user_id);

CREATE INDEX IF NOT EXISTS idx_campaign_drafts_updated 
  ON public.campaign_drafts(campaign_id, updated_at DESC);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_campaign_drafts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_campaign_drafts_updated_at ON public.campaign_drafts;
CREATE TRIGGER trg_set_campaign_drafts_updated_at
  BEFORE UPDATE ON public.campaign_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_campaign_drafts_updated_at();

-- Enable RLS
ALTER TABLE public.campaign_drafts ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_drafts' 
    AND policyname = 'campaign_drafts_select_own'
  ) THEN
    CREATE POLICY campaign_drafts_select_own ON public.campaign_drafts
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_drafts' 
    AND policyname = 'campaign_drafts_insert_own'
  ) THEN
    CREATE POLICY campaign_drafts_insert_own ON public.campaign_drafts
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_drafts' 
    AND policyname = 'campaign_drafts_update_own'
  ) THEN
    CREATE POLICY campaign_drafts_update_own ON public.campaign_drafts
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_drafts' 
    AND policyname = 'campaign_drafts_delete_own'
  ) THEN
    CREATE POLICY campaign_drafts_delete_own ON public.campaign_drafts
      FOR DELETE
      USING (user_id = auth.uid());
  END IF;
END $$;

-- 3. Create campaign_conditions table (for future advanced features)
CREATE TABLE IF NOT EXISTS public.campaign_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.campaign_steps(id) ON DELETE CASCADE,
  condition_type text NOT NULL CHECK (condition_type IN ('reply', 'hot', 'warm', 'not_interested', 'opened', 'clicked')),
  action text NOT NULL CHECK (action IN ('stop', 'skip_to_step', 'exit', 'alert')),
  action_value jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_conditions_campaign 
  ON public.campaign_conditions(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_conditions_step 
  ON public.campaign_conditions(step_id);

-- Enable RLS
ALTER TABLE public.campaign_conditions ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_conditions' 
    AND policyname = 'campaign_conditions_select_own'
  ) THEN
    CREATE POLICY campaign_conditions_select_own ON public.campaign_conditions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = campaign_conditions.campaign_id
          AND EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = c.workspace_id
            AND wm.user_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_conditions' 
    AND policyname = 'campaign_conditions_insert_own'
  ) THEN
    CREATE POLICY campaign_conditions_insert_own ON public.campaign_conditions
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = campaign_conditions.campaign_id
          AND EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = c.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role IN ('owner', 'admin', 'sender')
          )
        )
      );
  END IF;
END $$;

-- Comments
COMMENT ON TABLE public.campaign_steps IS 'Multi-step campaign sequence steps with drag-and-drop ordering';
COMMENT ON COLUMN public.campaign_steps.type IS 'Step type: email, wait (delay), or condition';
COMMENT ON COLUMN public.campaign_steps.delay_hours IS 'Hours to wait before sending this step (for wait steps or delay before email steps)';
COMMENT ON COLUMN public.campaign_steps.conditions IS 'JSON conditions for conditional logic (future feature)';
COMMENT ON COLUMN public.campaign_steps.personalization_flags IS 'JSON flags for personalization features (first_name, company, etc.)';
COMMENT ON TABLE public.campaign_drafts IS 'Autosave drafts for campaign builder (saves every 3 seconds)';
COMMENT ON TABLE public.campaign_conditions IS 'Advanced conditional logic for campaign steps (Growth + Domination plans)';





















































