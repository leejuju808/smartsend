-- Block 265: Team Permissions v1 - Add read_only role
-- Migration 280: Add 'read_only' role to team_members

-- Update the role constraint to include 'read_only'
ALTER TABLE public.team_members
DROP CONSTRAINT IF EXISTS team_members_role_check;

ALTER TABLE public.team_members
ADD CONSTRAINT team_members_role_check 
CHECK (role IN ('owner', 'admin', 'member', 'read_only'));

-- Update existing policies to handle read_only role appropriately
-- The existing policies already restrict management to owner/admin, which is correct

-- Add comment for documentation
COMMENT ON COLUMN public.team_members.role IS 'Role: owner (full access), admin (nearly full access), member (can edit campaigns/templates), read_only (view only)';









