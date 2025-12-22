-- Create sequences table
CREATE TABLE IF NOT EXISTS public.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create sequence_steps table
CREATE TABLE IF NOT EXISTS public.sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid REFERENCES public.sequences(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  subject text,
  body_text text,
  body_html text,
  delay_days int DEFAULT 0,
  condition text DEFAULT 'always',
  created_at timestamptz DEFAULT now()
);

-- Create sequence_enrollments table
CREATE TABLE IF NOT EXISTS public.sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid REFERENCES public.sequences(id) ON DELETE CASCADE,
  email citext NOT NULL,
  current_step int DEFAULT 0,
  last_sent timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(sequence_id, email)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS seq_steps_idx ON public.sequence_steps(sequence_id, step_order);
CREATE INDEX IF NOT EXISTS seq_enrollments_idx ON public.sequence_enrollments(sequence_id, email);

-- Create RPC function: find due steps
CREATE OR REPLACE FUNCTION public.due_sequence_steps()
RETURNS TABLE(
  id uuid, 
  sequence_id uuid, 
  step_order int, 
  email text, 
  subject text, 
  body_text text, 
  body_html text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    st.id, 
    st.sequence_id, 
    st.step_order, 
    e.email, 
    st.subject, 
    st.body_text, 
    st.body_html
  FROM sequence_enrollments e
  JOIN sequence_steps st ON st.sequence_id = e.sequence_id 
    AND st.step_order = e.current_step + 1
  WHERE (e.last_sent IS NULL OR now() >= e.last_sent + (st.delay_days || ' days')::interval)
    AND NOT EXISTS (
      SELECT 1 FROM events ev
      WHERE ev.campaign_id = st.sequence_id
        AND ev.recipient_email = e.email
        AND (
          (st.condition = 'opened' AND ev.type = 'open')
          OR (st.condition = 'clicked' AND ev.type = 'click')
          OR (st.condition = 'no_reply' AND ev.type = 'reply')
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Create RPC function: mark step sent
CREATE OR REPLACE FUNCTION public.mark_sequence_step_sent(step_id uuid, email text)
RETURNS void AS $$
BEGIN
  UPDATE sequence_enrollments
  SET current_step = current_step + 1, last_sent = now()
  WHERE sequence_id = (SELECT sequence_id FROM sequence_steps WHERE id = step_id)
    AND lower(email) = lower(mark_sequence_step_sent.email);
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies if needed
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;

-- Basic policies (you can customize these based on your auth setup)
CREATE POLICY "Allow all operations for sequences" ON public.sequences
  FOR ALL USING (true);

CREATE POLICY "Allow all operations for sequence_steps" ON public.sequence_steps
  FOR ALL USING (true);

CREATE POLICY "Allow all operations for sequence_enrollments" ON public.sequence_enrollments
  FOR ALL USING (true); 