-- Auto-Calendar Insert Feature Migration
-- Run this in Supabase SQL Editor or via CLI

-- Add calendly_url column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendly_url TEXT;

-- Create meetings table for tracking calendar invites
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  message_id uuid UNIQUE,
  calendly_url TEXT,
  status TEXT DEFAULT 'pending',
  lead_email TEXT,
  invite_status TEXT,
  invite_sent_at TIMESTAMP,
  invite_message_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_meetings_profile_id ON meetings(profile_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at);

-- Add comments for documentation
COMMENT ON TABLE meetings IS 'Tracks automatically generated calendar invites from reply intent detection';
COMMENT ON COLUMN meetings.status IS 'Meeting status: pending, confirmed, cancelled';
COMMENT ON COLUMN meetings.invite_status IS 'Email delivery status: sent, failed';
COMMENT ON COLUMN meetings.message_id IS 'Unique message ID to prevent duplicate invites';
