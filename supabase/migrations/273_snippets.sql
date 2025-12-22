-- Block 258 — Reply Composer v1
-- Snippets table for reusable canned responses

CREATE TABLE IF NOT EXISTS public.snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  category text,                 -- "pricing", "intro", "objection", "scheduling"
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snippets_workspace_id_idx ON public.snippets(workspace_id);
CREATE INDEX IF NOT EXISTS snippets_category_idx ON public.snippets(workspace_id, category);

-- RLS
ALTER TABLE public.snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snippets_select"
ON public.snippets
FOR SELECT
TO authenticated
USING (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

CREATE POLICY "snippets_insert"
ON public.snippets
FOR INSERT
TO authenticated
WITH CHECK (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

CREATE POLICY "snippets_update"
ON public.snippets
FOR UPDATE
TO authenticated
USING (workspace_id = (auth.jwt()->>'workspace_id')::uuid)
WITH CHECK (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

CREATE POLICY "snippets_delete"
ON public.snippets
FOR DELETE
TO authenticated
USING (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_snippets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS snippets_set_updated_at ON public.snippets;
CREATE TRIGGER snippets_set_updated_at
BEFORE UPDATE ON public.snippets
FOR EACH ROW
EXECUTE FUNCTION public.set_snippets_updated_at();









