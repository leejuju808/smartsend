-- Add generated domain field to contacts for domain-level engagement tracking
-- Migration: 20250132_add_contacts_domain_for_engagement.sql

-- Add domain column to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS domain TEXT;

-- Create index for domain queries
CREATE INDEX IF NOT EXISTS idx_contacts_domain ON contacts(domain);

-- Update existing contacts to populate domain field
UPDATE contacts 
SET domain = LOWER(SPLIT_PART(email, '@', 2))
WHERE domain IS NULL AND email IS NOT NULL;

-- Create function to automatically update domain when email changes
CREATE OR REPLACE FUNCTION update_contact_domain()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL AND (OLD.email IS NULL OR NEW.email != OLD.email) THEN
    NEW.domain := LOWER(SPLIT_PART(NEW.email, '@', 2));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update domain
DROP TRIGGER IF EXISTS trigger_update_contact_domain ON contacts;
CREATE TRIGGER trigger_update_contact_domain
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_domain(); 