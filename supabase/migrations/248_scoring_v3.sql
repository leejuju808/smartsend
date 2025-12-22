-- Block 233 — Lead Scoring v3
-- Vector Embeddings, Historical Reply Patterns, Similar-Lead Modeling, AI Probability-of-Reply Model

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- Add v3 scoring columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS score_v3 int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS probability_reply float,
  ADD COLUMN IF NOT EXISTS probability_meeting float;

-- Add index for embedding similarity search (using HNSW for performance)
CREATE INDEX IF NOT EXISTS idx_leads_embedding_hnsw ON public.leads 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- Add index for score_v3 filtering and sorting
CREATE INDEX IF NOT EXISTS idx_leads_score_v3 ON public.leads(score_v3 DESC);

-- Add index for probability filtering
CREATE INDEX IF NOT EXISTS idx_leads_probability_reply ON public.leads(probability_reply DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_leads_probability_meeting ON public.leads(probability_meeting DESC NULLS LAST);

-- Comment on columns
COMMENT ON COLUMN public.leads.embedding IS 'Vector embedding (1536 dimensions) for similarity matching';
COMMENT ON COLUMN public.leads.score_v3 IS 'ML-powered lead score (0-100) combining similarity, history, and AI predictions';
COMMENT ON COLUMN public.leads.probability_reply IS 'AI-predicted probability of reply (0-1)';
COMMENT ON COLUMN public.leads.probability_meeting IS 'AI-predicted probability of meeting booking (0-1)';

-- Create RPC function to find similar leads using pgvector
CREATE OR REPLACE FUNCTION public.similar_leads(
  target_embedding vector(1536),
  limit_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  score_v2 int,
  intent_primary text,
  similarity float,
  reply_detected boolean,
  meeting_booked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    COALESCE(ls.score, 0)::int as score_v2,
    l.intent_primary,
    1 - (l.embedding <=> target_embedding)::float as similarity,
    COALESCE(l.reply_detected, false) as reply_detected,
    COALESCE((l.status = 'replied' AND EXISTS (
      SELECT 1 FROM public.threads t 
      WHERE t.lead_id = l.id 
      AND t.status = 'replied'
    )), false) as meeting_booked
  FROM public.leads l
  LEFT JOIN public.lead_scores ls ON ls.lead_id = l.id
  WHERE l.embedding IS NOT NULL
    AND l.embedding <=> target_embedding < 1.0  -- Exclude exact matches
  ORDER BY l.embedding <=> target_embedding
  LIMIT limit_count;
END;
$$;

-- Comment on function
COMMENT ON FUNCTION public.similar_leads IS 'Find leads most similar to target embedding using cosine distance';

-- Create trigger function to score lead after embedding is generated
CREATE OR REPLACE FUNCTION public.trigger_score_lead_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edge_base_url text;
  payload json;
BEGIN
  -- Only trigger if embedding was just set and score_v3 hasn't been computed yet
  IF NEW.embedding IS NOT NULL AND (OLD.embedding IS NULL OR OLD.embedding IS DISTINCT FROM NEW.embedding) THEN
    IF NEW.score_v3 IS NULL OR NEW.score_v3 = 0 THEN
      -- Get edge function base URL
      edge_base_url := COALESCE(
        current_setting('app.settings.edge_base_url', true),
        current_setting('app.supabase_url', true),
        'https://' || current_setting('app.project_ref', true) || '.supabase.co'
      ) || '/functions/v1/score-lead-v3';

      -- Build payload with lead data
      SELECT json_build_object('lead', to_jsonb(NEW))
      INTO payload;

      -- Call v3 scoring edge function (fire and forget)
      IF edge_base_url IS NOT NULL AND payload IS NOT NULL THEN
        PERFORM net.http_post(
          url := edge_base_url,
          body := payload::text,
          headers := json_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(
              current_setting('app.settings.service_role_key', true),
              current_setting('app.supabase_service_role_key', true),
              current_setting('app.service_role_key', true)
            )
          )::text
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the update
    RAISE WARNING 'Failed to trigger v3 scoring: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger to score lead after embedding is generated
DROP TRIGGER IF EXISTS tr_lead_score_v3 ON public.leads;
CREATE TRIGGER tr_lead_score_v3
AFTER UPDATE OF embedding ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_score_lead_v3();

