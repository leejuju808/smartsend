-- =========================================================
-- Block 21721 — SmartSend Roofing Inbox Actions v1
-- (Mark Hot / Cold / Book Job / Add Notes)
-- =========================================================
-- 
-- This is where SmartSend stops being "just automation" and starts feeling 
-- like a mini sales console for roofers.
-- 
-- From the inbox or contact view they can now:
-- 🔥 Mark a lead as Hot / Warm / Not interested
-- 🧊 Mark a lead as Cold (stop follow-ups)
-- 📅 Book a job (with value + date)
-- 📝 Add internal notes
-- 
-- All of that pushes into the DB and pipes into the metrics we already built.

-- ============================================================================
-- A. Lead status enum
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE lead_status AS ENUM (
      'new',
      'working',
      'booked',
      'lost',
      'cold'
    );
  END IF;
END $$;

-- ============================================================================
-- B. Extend leads table
-- ============================================================================

-- Add status column (using lead_status enum)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'leads' 
      AND column_name = 'status'
  ) THEN
    -- If status column doesn't exist, add it
    ALTER TABLE public.leads
      ADD COLUMN status lead_status NOT NULL DEFAULT 'new';
  ELSE
    -- If status column exists but is text, we need to handle migration
    -- For now, we'll add a new column with a different approach
    -- Check if it's already the enum type
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'status'
        AND udt_name = 'lead_status'
    ) THEN
      -- Status exists but is not the enum type - add a new column
      ALTER TABLE public.leads
        ADD COLUMN IF NOT EXISTS lead_status lead_status DEFAULT 'new';
    END IF;
  END IF;
END $$;

-- Add booked_job_id column
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS booked_job_id uuid;

-- Ensure intent column exists (from Block 21708)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'leads' 
      AND column_name = 'intent'
  ) THEN
    -- Create lead_intent enum if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_intent') THEN
      CREATE TYPE lead_intent AS ENUM (
        'unknown',
        'hot',
        'warm',
        'not_interested',
        'other'
      );
    END IF;
    
    ALTER TABLE public.leads
      ADD COLUMN intent lead_intent NOT NULL DEFAULT 'unknown';
  END IF;
END $$;

-- Add estimated_job_value column (for quick access)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS estimated_job_value numeric(12,2);

-- Add company_id if it doesn't exist (from Block 271)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'leads' 
      AND column_name = 'company_id'
  ) THEN
    -- Check if companies table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'companies'
    ) THEN
      ALTER TABLE public.leads
        ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
    ELSE
      ALTER TABLE public.leads
        ADD COLUMN company_id uuid;
    END IF;
  END IF;
END $$;

-- Add contact_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'leads' 
      AND column_name = 'contact_id'
  ) THEN
    -- Check if contacts table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'contacts'
    ) THEN
      ALTER TABLE public.leads
        ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
    ELSE
      ALTER TABLE public.leads
        ADD COLUMN contact_id uuid;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_intent ON public.leads(intent);
CREATE INDEX IF NOT EXISTS idx_leads_booked_job ON public.leads(booked_job_id) WHERE booked_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_company ON public.leads(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_contact ON public.leads(contact_id) WHERE contact_id IS NOT NULL;

-- ============================================================================
-- C. Jobs table (for booked jobs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  contact_id uuid NOT NULL,

  title text NOT NULL,               -- e.g. "Roof replacement - Johnson"
  scheduled_date date,               -- when crew is expected to start / inspect
  estimated_value numeric(12,2),    -- money signal
  status text NOT NULL DEFAULT 'booked', -- simple text for now

  created_at timestamptz NOT NULL DEFAULT now(),
  booked_at timestamptz NOT NULL DEFAULT now()
);

-- Foreign key constraints (if tables exist)
DO $$
BEGIN
  -- Add FK to companies if companies table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'companies'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'jobs_company_id_fkey'
    ) THEN
      ALTER TABLE public.jobs
        ADD CONSTRAINT jobs_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES public.companies(id)
        ON DELETE CASCADE;
    END IF;
  END IF;

  -- Add FK to leads
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'jobs_lead_id_fkey'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_lead_id_fkey
      FOREIGN KEY (lead_id)
      REFERENCES public.leads(id)
      ON DELETE CASCADE;
  END IF;

  -- Add FK to contacts if contacts table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'contacts'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'jobs_contact_id_fkey'
    ) THEN
      ALTER TABLE public.jobs
        ADD CONSTRAINT jobs_contact_id_fkey
        FOREIGN KEY (contact_id)
        REFERENCES public.contacts(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_company ON public.jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_lead ON public.jobs (lead_id);
CREATE INDEX IF NOT EXISTS idx_jobs_contact ON public.jobs (contact_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON public.jobs (scheduled_date);

-- ============================================================================
-- D. Lead notes table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  author_user_id uuid,          -- optional

  body text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Foreign key constraints (if tables exist)
DO $$
BEGIN
  -- Add FK to companies if companies table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'companies'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'lead_notes_company_id_fkey'
    ) THEN
      ALTER TABLE public.lead_notes
        ADD CONSTRAINT lead_notes_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES public.companies(id)
        ON DELETE CASCADE;
    END IF;
  END IF;

  -- Add FK to leads
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lead_notes_lead_id_fkey'
  ) THEN
    ALTER TABLE public.lead_notes
      ADD CONSTRAINT lead_notes_lead_id_fkey
      FOREIGN KEY (lead_id)
      REFERENCES public.leads(id)
      ON DELETE CASCADE;
  END IF;

  -- Add FK to contacts if contacts table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'contacts'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'lead_notes_contact_id_fkey'
    ) THEN
      ALTER TABLE public.lead_notes
        ADD CONSTRAINT lead_notes_contact_id_fkey
        FOREIGN KEY (contact_id)
        REFERENCES public.contacts(id)
        ON DELETE SET NULL;
    END IF;
  END IF;

  -- Add FK to auth.users for author_user_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lead_notes_author_user_id_fkey'
  ) THEN
    ALTER TABLE public.lead_notes
      ADD CONSTRAINT lead_notes_author_user_id_fkey
      FOREIGN KEY (author_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON public.lead_notes (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_company ON public.lead_notes (company_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_contact ON public.lead_notes (contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at ON public.lead_notes (created_at DESC);

-- ============================================================================
-- E. RLS Policies
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- Jobs RLS: Service role has full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'jobs'
      AND policyname = 'jobs_service_role'
  ) THEN
    CREATE POLICY "jobs_service_role"
      ON public.jobs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Lead notes RLS: Service role has full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_notes'
      AND policyname = 'lead_notes_service_role'
  ) THEN
    CREATE POLICY "lead_notes_service_role"
      ON public.lead_notes
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Comments
COMMENT ON TYPE lead_status IS 'Block 21721: Lead pipeline status (new → working → booked/lost/cold)';
COMMENT ON TABLE public.jobs IS 'Block 21721: Booked jobs for leads (with value + scheduled date)';
COMMENT ON TABLE public.lead_notes IS 'Block 21721: Internal notes for leads';











































