-- Block 8510 — Quick Reply from Inbox v1 (Manual Replies via SmartSend)
-- Extend campaign_sends table to support manual replies

-- Add columns for manual reply tracking
ALTER TABLE campaign_sends
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'campaign',
  -- e.g. 'campaign', 'speed_to_lead', 'manual_reply'
  ADD COLUMN IF NOT EXISTS in_reply_to_reply_id UUID,
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS body TEXT;

-- Add foreign key constraint for in_reply_to_reply_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'campaign_sends_in_reply_to_reply_id_fkey'
  ) THEN
    ALTER TABLE campaign_sends
      ADD CONSTRAINT campaign_sends_in_reply_to_reply_id_fkey
      FOREIGN KEY (in_reply_to_reply_id) REFERENCES campaign_replies (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_campaign_sends_kind
  ON campaign_sends (kind);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_in_reply_to
  ON campaign_sends (in_reply_to_reply_id);

-- Update RLS policy to allow authenticated users to insert manual replies
-- (they can already view via existing policy)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_sends' 
    AND policyname = 'user can insert manual replies'
  ) THEN
    CREATE POLICY "user can insert manual replies"
    ON campaign_sends FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM campaigns c
        JOIN campaign_members cm ON cm.campaign_id = c.id
        WHERE c.id = campaign_sends.campaign_id
        AND cm.user_id = auth.uid()
      )
    );
  END IF;
END $$;































































