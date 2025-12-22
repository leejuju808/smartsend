-- meetings: add lead email + invite send metadata
ALTER TABLE meetings 
  ADD COLUMN IF NOT EXISTS lead_email TEXT,
  ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS invite_message_id TEXT,
  ADD COLUMN IF NOT EXISTS invite_status TEXT CHECK (invite_status IN ('pending','sent','failed')) DEFAULT 'pending';

-- small helper index
CREATE INDEX IF NOT EXISTS idx_meetings_message ON meetings(message_id);

-- Add comment for documentation
COMMENT ON COLUMN meetings.lead_email IS 'Email address of the lead who replied';
COMMENT ON COLUMN meetings.invite_sent_at IS 'Timestamp when the meeting invite email was sent';
COMMENT ON COLUMN meetings.invite_message_id IS 'Resend message ID for tracking';
COMMENT ON COLUMN meetings.invite_status IS 'Status of the invite email: pending, sent, or failed';
