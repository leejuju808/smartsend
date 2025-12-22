-- Block 20150 — Campaign Attribution Hard Link
-- Tighten Campaign Link + Index for inbox_threads

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'inbox_threads_source_campaign_fk'
  ) THEN
    ALTER TABLE inbox_threads
    ADD CONSTRAINT inbox_threads_source_campaign_fk
      FOREIGN KEY (source_campaign_id)
      REFERENCES campaigns(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Create index if it doesn't exist (may already exist from previous migration)
CREATE INDEX IF NOT EXISTS idx_inbox_source_campaign
ON inbox_threads (source_campaign_id);

-- Comment for documentation
COMMENT ON CONSTRAINT inbox_threads_source_campaign_fk ON inbox_threads IS 
  'Foreign key linking inbox threads to their source SmartSend campaign for revenue attribution';

















































