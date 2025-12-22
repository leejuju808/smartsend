-- Block 96000 — Auto-Personalization Engine v1: Home Data Cache
-- Cache table for home data enrichment (address, year built, roof type, etc.)

CREATE TABLE IF NOT EXISTS home_data_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  year_built INT,
  roof_type TEXT,
  last_sale_year INT,
  est_home_age INT,
  neighborhood TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by address
CREATE INDEX IF NOT EXISTS idx_home_data_cache_address ON home_data_cache(address);
CREATE INDEX IF NOT EXISTS idx_home_data_cache_city_state ON home_data_cache(city, state);
CREATE INDEX IF NOT EXISTS idx_home_data_cache_zip ON home_data_cache(zip);

-- Unique constraint on address to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_home_data_cache_unique_address 
ON home_data_cache(LOWER(TRIM(address)), COALESCE(city, ''), COALESCE(state, ''), COALESCE(zip, ''));

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_home_data_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_home_data_cache_updated_at
BEFORE UPDATE ON home_data_cache
FOR EACH ROW
EXECUTE FUNCTION update_home_data_cache_updated_at();

-- Enable RLS
ALTER TABLE home_data_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies: service role has full access
CREATE POLICY "home_data_cache_service_role_all" ON home_data_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Allow authenticated users to read cached data
CREATE POLICY "home_data_cache_select_authenticated" ON home_data_cache
  FOR SELECT TO authenticated
  USING (true);

-- Allow authenticated users to insert/update (for edge function usage)
CREATE POLICY "home_data_cache_modify_authenticated" ON home_data_cache
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "home_data_cache_update_authenticated" ON home_data_cache
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);


























