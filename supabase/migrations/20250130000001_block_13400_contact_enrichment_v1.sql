-- =========================================================
-- Block 13400 — SmartSend Contact Enrichment v1
-- (The System That Auto-Fills Homeowner City, Zip, Neighborhood & Property Details Without Roofer Effort)
-- =========================================================

-- 1) Contact Enrichment Table
CREATE TABLE IF NOT EXISTS public.contact_enrichment (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id              uuid NOT NULL,
  workspace_id            uuid NOT NULL,
  
  -- Name enrichment
  inferred_first_name     text,
  inferred_last_name      text,
  name_confidence         numeric(3,2) DEFAULT 0, -- 0.0 to 1.0
  
  -- Location enrichment
  inferred_city           text,
  city_confidence         numeric(3,2) DEFAULT 0,
  inferred_zip            text,
  zip_confidence          numeric(3,2) DEFAULT 0,
  inferred_state          text,
  inferred_neighborhood   text,
  neighborhood_confidence numeric(3,2) DEFAULT 0,
  
  -- Property enrichment
  property_type           text, -- 'single_family', 'multi_family', 'commercial', 'unknown'
  property_type_confidence numeric(3,2) DEFAULT 0,
  
  -- Insurance & storm enrichment
  insurance_interest      boolean DEFAULT false,
  storm_risk_level        text, -- 'high', 'medium', 'low', 'unknown'
  
  -- Metadata
  enrichment_sources      jsonb DEFAULT '[]'::jsonb, -- Array of sources used: ['email_domain', 'ip', 'reply_content', etc.]
  last_enriched_at        timestamptz,
  enrichment_version      integer DEFAULT 1,
  
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT contact_enrichment_contact_fk
    FOREIGN KEY (contact_id)
    REFERENCES public.contacts(id)
    ON DELETE CASCADE,
  
  CONSTRAINT contact_enrichment_workspace_fk
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE CASCADE
);

-- Unique constraint: one enrichment record per contact
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_enrichment_contact
  ON public.contact_enrichment (contact_id);

-- Indexes for batch queries
CREATE INDEX IF NOT EXISTS idx_contact_enrichment_workspace
  ON public.contact_enrichment (workspace_id);

CREATE INDEX IF NOT EXISTS idx_contact_enrichment_missing_city
  ON public.contact_enrichment (workspace_id, inferred_city)
  WHERE inferred_city IS NULL OR city_confidence < 0.7;

CREATE INDEX IF NOT EXISTS idx_contact_enrichment_missing_zip
  ON public.contact_enrichment (workspace_id, inferred_zip)
  WHERE inferred_zip IS NULL OR zip_confidence < 0.7;

CREATE INDEX IF NOT EXISTS idx_contact_enrichment_missing_name
  ON public.contact_enrichment (workspace_id, inferred_first_name)
  WHERE inferred_first_name IS NULL OR name_confidence < 0.7;

CREATE INDEX IF NOT EXISTS idx_contact_enrichment_last_enriched
  ON public.contact_enrichment (workspace_id, last_enriched_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_contact_enrichment_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_contact_enrichment_updated_at ON public.contact_enrichment;

CREATE TRIGGER trg_set_contact_enrichment_updated_at
BEFORE UPDATE ON public.contact_enrichment
FOR EACH ROW
EXECUTE FUNCTION public.set_contact_enrichment_updated_at();

-- 2) Function: Apply enrichment to contacts table (only when confidence > 0.7)
CREATE OR REPLACE FUNCTION public.apply_contact_enrichment(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enrichment public.contact_enrichment%ROWTYPE;
BEGIN
  -- Get enrichment data
  SELECT * INTO v_enrichment
  FROM public.contact_enrichment
  WHERE contact_id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Update contacts table only when confidence is high enough
  UPDATE public.contacts
  SET
    first_name = COALESCE(
      first_name,
      CASE WHEN v_enrichment.name_confidence >= 0.7 THEN v_enrichment.inferred_first_name ELSE NULL END
    ),
    last_name = COALESCE(
      last_name,
      CASE WHEN v_enrichment.name_confidence >= 0.7 THEN v_enrichment.inferred_last_name ELSE NULL END
    ),
    city = COALESCE(
      city,
      CASE WHEN v_enrichment.city_confidence >= 0.7 THEN v_enrichment.inferred_city ELSE NULL END
    ),
    postal_code = COALESCE(
      postal_code,
      CASE WHEN v_enrichment.zip_confidence >= 0.7 THEN v_enrichment.inferred_zip ELSE NULL END
    ),
    state = COALESCE(
      state,
      v_enrichment.inferred_state
    ),
    tags = CASE
      WHEN v_enrichment.inferred_neighborhood IS NOT NULL AND v_enrichment.neighborhood_confidence >= 0.7
        THEN tags || ARRAY[v_enrichment.inferred_neighborhood]
      WHEN v_enrichment.insurance_interest = true
        THEN tags || ARRAY['insurance_interest']
      ELSE tags
    END
  WHERE id = p_contact_id;
END;
$$;

-- 3) Function: Get or create enrichment record
CREATE OR REPLACE FUNCTION public.get_or_create_enrichment(
  p_contact_id uuid,
  p_workspace_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enrichment_id uuid;
BEGIN
  SELECT id INTO v_enrichment_id
  FROM public.contact_enrichment
  WHERE contact_id = p_contact_id;
  
  IF v_enrichment_id IS NOT NULL THEN
    RETURN v_enrichment_id;
  END IF;
  
  INSERT INTO public.contact_enrichment (contact_id, workspace_id)
  VALUES (p_contact_id, p_workspace_id)
  RETURNING id INTO v_enrichment_id;
  
  RETURN v_enrichment_id;
END;
$$;

-- 4) RLS for contact_enrichment
ALTER TABLE public.contact_enrichment ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contact_enrichment'
      AND policyname = 'Contact enrichment scoped to workspace'
  ) THEN
    CREATE POLICY "Contact enrichment scoped to workspace"
    ON public.contact_enrichment
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- 5) Comments
COMMENT ON TABLE public.contact_enrichment IS 'Stores automatically enriched contact data (city, zip, neighborhood, property type, insurance interest)';
COMMENT ON COLUMN public.contact_enrichment.name_confidence IS 'Confidence score 0.0-1.0 for name extraction accuracy';
COMMENT ON COLUMN public.contact_enrichment.city_confidence IS 'Confidence score 0.0-1.0 for city inference';
COMMENT ON COLUMN public.contact_enrichment.zip_confidence IS 'Confidence score 0.0-1.0 for ZIP code inference';
COMMENT ON COLUMN public.contact_enrichment.neighborhood_confidence IS 'Confidence score 0.0-1.0 for neighborhood detection';
COMMENT ON COLUMN public.contact_enrichment.property_type IS 'Inferred property type: single_family, multi_family, commercial, unknown';
COMMENT ON COLUMN public.contact_enrichment.insurance_interest IS 'True if contact shows insurance claim interest (from replies or storm data)';
COMMENT ON COLUMN public.contact_enrichment.storm_risk_level IS 'Storm risk assessment: high, medium, low, unknown';
COMMENT ON COLUMN public.contact_enrichment.enrichment_sources IS 'JSON array of sources used: ["email_domain", "ip", "reply_content", "zip_lookup"]';

-- 6) RPC Function: Batch enrichment (called by edge function)
-- Note: This is a placeholder - actual enrichment logic is in TypeScript
-- This function can be called by the batch job to trigger enrichment
CREATE OR REPLACE FUNCTION public.enrich_contact_batch(
  p_contact_id uuid,
  p_workspace_id uuid,
  p_email text,
  p_existing_first_name text DEFAULT NULL,
  p_existing_last_name text DEFAULT NULL,
  p_existing_city text DEFAULT NULL,
  p_existing_zip text DEFAULT NULL,
  p_existing_state text DEFAULT NULL,
  p_service_area text[] DEFAULT ARRAY[]::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enrichment_id uuid;
BEGIN
  -- Get or create enrichment record
  SELECT id INTO v_enrichment_id
  FROM public.contact_enrichment
  WHERE contact_id = p_contact_id;
  
  IF v_enrichment_id IS NULL THEN
    INSERT INTO public.contact_enrichment (contact_id, workspace_id)
    VALUES (p_contact_id, p_workspace_id)
    RETURNING id INTO v_enrichment_id;
  END IF;
  
  -- Note: Actual enrichment logic runs in TypeScript/Edge Function
  -- This function just ensures the enrichment record exists
  -- The edge function will call the TypeScript enrichment service
  -- and then update this record with the results
  
  -- Update last_enriched_at timestamp
  UPDATE public.contact_enrichment
  SET last_enriched_at = now()
  WHERE id = v_enrichment_id;
END;
$$;

