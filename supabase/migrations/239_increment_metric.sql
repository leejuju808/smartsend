-- Block 224 — Team Analytics v1
-- Helper function to increment user metrics atomically

CREATE OR REPLACE FUNCTION public.increment_user_metric(
  p_user_id uuid,
  p_workspace_id uuid,
  p_column text
)
RETURNS void AS $$
BEGIN
  -- Ensure row exists (upsert pattern)
  INSERT INTO public.user_metrics (user_id, workspace_id, updated_at, emails_sent)
  VALUES (p_user_id, p_workspace_id, now(), 0)
  ON CONFLICT (user_id, workspace_id) DO NOTHING;

  -- Increment the specified column
  EXECUTE format(
    'UPDATE public.user_metrics SET %I = %I + 1, updated_at = now() WHERE user_id = $1 AND workspace_id = $2',
    p_column, p_column
  )
  USING p_user_id, p_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role and authenticated users
GRANT EXECUTE ON FUNCTION public.increment_user_metric(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_user_metric(uuid, uuid, text) TO authenticated;










