-- Contact Personalization Fields Migration
-- Run this in Supabase SQL Editor or via CLI

-- Add personalization fields to contacts table
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN contacts.first_name IS 'Contact first name for personalization';
COMMENT ON COLUMN contacts.last_name IS 'Contact last name for personalization';
COMMENT ON COLUMN contacts.meta IS 'Additional contact metadata for template variables';