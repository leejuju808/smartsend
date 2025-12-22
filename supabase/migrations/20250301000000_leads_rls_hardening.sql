-- RLS hardening for leads table
-- Prevents client users from directly updating lead status
-- Status updates should only be done via Edge Functions with service role

-- Ensure RLS is enabled on leads table
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Drop any existing update policies that allow status changes from clients
DROP POLICY IF EXISTS "users can update own leads" ON public.leads;
DROP POLICY IF EXISTS "authenticated can update leads" ON public.leads;
DROP POLICY IF EXISTS "update leads for authenticated" ON public.leads;

-- Create a read-only policy for authenticated users
CREATE POLICY "readonly leads for authenticated"
ON public.leads
FOR SELECT
TO authenticated
USING (true);

-- Revoke update privileges from authenticated role
-- This ensures only service role (via Edge Functions) can update
REVOKE UPDATE ON TABLE public.leads FROM authenticated;

-- Note: Service role bypasses RLS, so Edge Functions can still update leads.status
-- This is the intended behavior - only server-side code should update status

