ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sequences_select ON public.sequences;
CREATE POLICY sequences_select
ON public.sequences
FOR SELECT
TO authenticated
USING (owner = auth.uid());

DROP POLICY IF EXISTS sequences_modify ON public.sequences;
CREATE POLICY sequences_modify
ON public.sequences
FOR INSERT WITH CHECK (owner = auth.uid())
FOR UPDATE USING (owner = auth.uid())
WITH CHECK (owner = auth.uid())
FOR DELETE USING (owner = auth.uid());