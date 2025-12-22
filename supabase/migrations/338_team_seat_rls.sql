-- Block 338: Seat Enforcement + Team Management v1
-- Optional RLS policy for team_members insert control
-- Note: Real enforcement is done in API routes

-- Ensure RLS is enabled (should already be enabled from migration 258)
alter table team_members enable row level security;

-- Optional: Insert policy (keeps RLS simple; enforcement is in API)
-- The existing "team_members: manage by owner/admin" policy already handles inserts
-- This is just for documentation/clarity

-- No additional policy needed - existing policies are sufficient
-- API routes will enforce seat limits before allowing inserts






