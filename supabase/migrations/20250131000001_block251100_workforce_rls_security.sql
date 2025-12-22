-- =========================================================
-- Block 251100 — SmartSend Workforce Hub RLS + Security Enforcement
-- "Workforce RLS + Security Enforcement"
-- =========================================================
-- 
-- This is the security backbone that makes SmartSend feel like a REAL system, not a toy.
-- This is where we lock down Workforce data so ONLY the correct company can see employees, 
-- certs, training, logs, applicants.
--
-- Roofers will feel stupid not using SmartSend because:
-- "Our whole workforce data is secure and separated…
-- Other apps literally leak crew info across companies."
--
-- We build this once → system becomes enterprise-ready.
-- =========================================================

-- ============================================================================
-- PART 1 — PREP STEP: Attach company_id to EVERY table
-- ============================================================================
-- If any of these tables don't have company_id, add it now.

-- Check and add company_id to workforce_training_modules if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workforce_training_modules' 
    AND column_name = 'company_id'
  ) THEN
    -- Try to reference companies table, fallback to roofing_companies if companies doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
      ALTER TABLE workforce_training_modules
      ADD COLUMN company_id uuid REFERENCES companies(id);
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
      ALTER TABLE workforce_training_modules
      ADD COLUMN company_id uuid REFERENCES roofing_companies(id);
    END IF;
  END IF;
END $$;

-- Check and add company_id to workforce_training_progress if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workforce_training_progress' 
    AND column_name = 'company_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
      ALTER TABLE workforce_training_progress
      ADD COLUMN company_id uuid REFERENCES companies(id);
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
      ALTER TABLE workforce_training_progress
      ADD COLUMN company_id uuid REFERENCES roofing_companies(id);
    END IF;
  END IF;
END $$;

-- Check and add company_id to workforce_certifications if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workforce_certifications' 
    AND column_name = 'company_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
      ALTER TABLE workforce_certifications
      ADD COLUMN company_id uuid REFERENCES companies(id);
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
      ALTER TABLE workforce_certifications
      ADD COLUMN company_id uuid REFERENCES roofing_companies(id);
    END IF;
  END IF;
END $$;

-- Check and add company_id to workforce_performance_logs if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workforce_performance_logs' 
    AND column_name = 'company_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
      ALTER TABLE workforce_performance_logs
      ADD COLUMN company_id uuid REFERENCES companies(id);
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
      ALTER TABLE workforce_performance_logs
      ADD COLUMN company_id uuid REFERENCES roofing_companies(id);
    END IF;
  END IF;
END $$;

-- Check and add company_id to workforce_applicants if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workforce_applicants' 
    AND column_name = 'company_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
      ALTER TABLE workforce_applicants
      ADD COLUMN company_id uuid REFERENCES companies(id);
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
      ALTER TABLE workforce_applicants
      ADD COLUMN company_id uuid REFERENCES roofing_companies(id);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 2 — BACKFILL: Assign company_id automatically on insert
-- ============================================================================
-- Guarantee every row belongs to the user's company by applying this rule

CREATE OR REPLACE FUNCTION set_company_id()
RETURNS TRIGGER 
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id = (auth.jwt() ->> 'company_id')::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_company_id() IS 'Block 251100: Automatically sets company_id from JWT on insert';

-- Apply trigger to all tables
DROP TRIGGER IF EXISTS set_company_id_employees ON workforce_employees;
CREATE TRIGGER set_company_id_employees
BEFORE INSERT ON workforce_employees
FOR EACH ROW EXECUTE FUNCTION set_company_id();

DROP TRIGGER IF EXISTS set_company_id_applicants ON workforce_applicants;
CREATE TRIGGER set_company_id_applicants
BEFORE INSERT ON workforce_applicants
FOR EACH ROW EXECUTE FUNCTION set_company_id();

DROP TRIGGER IF EXISTS set_company_id_training ON workforce_training_modules;
CREATE TRIGGER set_company_id_training
BEFORE INSERT ON workforce_training_modules
FOR EACH ROW EXECUTE FUNCTION set_company_id();

-- For tables that reference employees, we need to set company_id from the employee
-- Handle workforce_training_progress, certifications, performance_logs (they have employee_id)
CREATE OR REPLACE FUNCTION set_company_id_from_employee()
RETURNS TRIGGER 
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Try to get company_id from JWT first
  v_company_id := (auth.jwt() ->> 'company_id')::uuid;
  
  -- If not in JWT, try to get from employee
  IF v_company_id IS NULL AND NEW.employee_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM workforce_employees
    WHERE id = NEW.employee_id;
  END IF;
  
  IF NEW.company_id IS NULL AND v_company_id IS NOT NULL THEN
    NEW.company_id := v_company_id;
  ELSIF NEW.company_id IS NULL THEN
    NEW.company_id := (auth.jwt() ->> 'company_id')::uuid;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers for employee-referenced tables
DROP TRIGGER IF EXISTS set_company_id_progress ON workforce_training_progress;
CREATE TRIGGER set_company_id_progress
BEFORE INSERT ON workforce_training_progress
FOR EACH ROW EXECUTE FUNCTION set_company_id_from_employee();

DROP TRIGGER IF EXISTS set_company_id_certs ON workforce_certifications;
CREATE TRIGGER set_company_id_certs
BEFORE INSERT ON workforce_certifications
FOR EACH ROW EXECUTE FUNCTION set_company_id_from_employee();

DROP TRIGGER IF EXISTS set_company_id_logs ON workforce_performance_logs;
CREATE TRIGGER set_company_id_logs
BEFORE INSERT ON workforce_performance_logs
FOR EACH ROW EXECUTE FUNCTION set_company_id_from_employee();

-- ============================================================================
-- PART 3 — ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE workforce_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_performance_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 4 — POLICIES: Very simple, very strict
-- ============================================================================
-- Users can only read/write rows where company_id = auth.uid()'s company

-- 4.1 SELECT Policies (read)

DROP POLICY IF EXISTS "company can select workforce_employees" ON workforce_employees;
CREATE POLICY "company can select workforce_employees"
ON workforce_employees FOR SELECT
USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can select workforce_applicants" ON workforce_applicants;
CREATE POLICY "company can select workforce_applicants"
ON workforce_applicants FOR SELECT
USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can select training modules" ON workforce_training_modules;
CREATE POLICY "company can select training modules"
ON workforce_training_modules FOR SELECT
USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can select training progress" ON workforce_training_progress;
CREATE POLICY "company can select training progress"
ON workforce_training_progress FOR SELECT
USING (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_training_progress.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

DROP POLICY IF EXISTS "company can select certs" ON workforce_certifications;
CREATE POLICY "company can select certs"
ON workforce_certifications FOR SELECT
USING (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_certifications.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

DROP POLICY IF EXISTS "company can select performance logs" ON workforce_performance_logs;
CREATE POLICY "company can select performance logs"
ON workforce_performance_logs FOR SELECT
USING (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_performance_logs.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

-- 4.2 INSERT Policies (create)

DROP POLICY IF EXISTS "company can insert workforce_employees" ON workforce_employees;
CREATE POLICY "company can insert workforce_employees"
ON workforce_employees FOR INSERT
WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can insert applicants" ON workforce_applicants;
CREATE POLICY "company can insert applicants"
ON workforce_applicants FOR INSERT
WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can insert training modules" ON workforce_training_modules;
CREATE POLICY "company can insert training modules"
ON workforce_training_modules FOR INSERT
WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can insert training progress" ON workforce_training_progress;
CREATE POLICY "company can insert training progress"
ON workforce_training_progress FOR INSERT
WITH CHECK (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_training_progress.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

DROP POLICY IF EXISTS "company can insert certs" ON workforce_certifications;
CREATE POLICY "company can insert certs"
ON workforce_certifications FOR INSERT
WITH CHECK (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_certifications.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

DROP POLICY IF EXISTS "company can insert performance logs" ON workforce_performance_logs;
CREATE POLICY "company can insert performance logs"
ON workforce_performance_logs FOR INSERT
WITH CHECK (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_performance_logs.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

-- 4.3 UPDATE Policies (edit)

DROP POLICY IF EXISTS "company can update workforce_employees" ON workforce_employees;
CREATE POLICY "company can update workforce_employees"
ON workforce_employees FOR UPDATE
USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can update applicants" ON workforce_applicants;
CREATE POLICY "company can update applicants"
ON workforce_applicants FOR UPDATE
USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can update training modules" ON workforce_training_modules;
CREATE POLICY "company can update training modules"
ON workforce_training_modules FOR UPDATE
USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can update progress" ON workforce_training_progress;
CREATE POLICY "company can update progress"
ON workforce_training_progress FOR UPDATE
USING (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_training_progress.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
)
WITH CHECK (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_training_progress.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

DROP POLICY IF EXISTS "company can update certs" ON workforce_certifications;
CREATE POLICY "company can update certs"
ON workforce_certifications FOR UPDATE
USING (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_certifications.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
)
WITH CHECK (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_certifications.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

DROP POLICY IF EXISTS "company can update performance logs" ON workforce_performance_logs;
CREATE POLICY "company can update performance logs"
ON workforce_performance_logs FOR UPDATE
USING (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_performance_logs.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
)
WITH CHECK (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_performance_logs.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

-- 4.4 DELETE Policies (remove)

DROP POLICY IF EXISTS "company can delete workforce_employees" ON workforce_employees;
CREATE POLICY "company can delete workforce_employees"
ON workforce_employees FOR DELETE
USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can delete applicants" ON workforce_applicants;
CREATE POLICY "company can delete applicants"
ON workforce_applicants FOR DELETE
USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can delete training modules" ON workforce_training_modules;
CREATE POLICY "company can delete training modules"
ON workforce_training_modules FOR DELETE
USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

DROP POLICY IF EXISTS "company can delete progress" ON workforce_training_progress;
CREATE POLICY "company can delete progress"
ON workforce_training_progress FOR DELETE
USING (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_training_progress.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

DROP POLICY IF EXISTS "company can delete certs" ON workforce_certifications;
CREATE POLICY "company can delete certs"
ON workforce_certifications FOR DELETE
USING (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_certifications.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

DROP POLICY IF EXISTS "company can delete logs" ON workforce_performance_logs;
CREATE POLICY "company can delete logs"
ON workforce_performance_logs FOR DELETE
USING (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  OR EXISTS (
    SELECT 1 FROM workforce_employees we
    WHERE we.id = workforce_performance_logs.employee_id
    AND we.company_id = (auth.jwt() ->> 'company_id')::uuid
  )
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION set_company_id() IS 'Block 251100: Automatically sets company_id from JWT on insert';
COMMENT ON FUNCTION set_company_id_from_employee() IS 'Block 251100: Sets company_id from employee or JWT for employee-referenced tables';
























