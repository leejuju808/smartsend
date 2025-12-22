-- Migration: Create beta_signups table for AUREV OS Beta launch
-- Created: 2025-02-16

CREATE TABLE IF NOT EXISTS beta_signups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'active', 'declined')),
  notes TEXT,
  invited_at TIMESTAMP WITH TIME ZONE,
  activated_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_beta_signups_email ON beta_signups(email);
CREATE INDEX IF NOT EXISTS idx_beta_signups_status ON beta_signups(status);
CREATE INDEX IF NOT EXISTS idx_beta_signups_created_at ON beta_signups(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE beta_signups ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert (public signup)
CREATE POLICY "Allow public beta signups"
  ON beta_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policy: Only authenticated users can read (for admin dashboard)
CREATE POLICY "Allow authenticated reads"
  ON beta_signups
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only service role can update (for admin operations)
CREATE POLICY "Allow service role updates"
  ON beta_signups
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE beta_signups IS 'Beta signups for AUREV OS launch campaign';
COMMENT ON COLUMN beta_signups.email IS 'Email address of beta signup';
COMMENT ON COLUMN beta_signups.status IS 'Status: pending, invited, active, declined';

