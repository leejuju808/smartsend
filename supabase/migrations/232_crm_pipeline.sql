-- Block 219 — CRM Pipeline v1
-- Kanban Pipeline, Stages, Drag-to-Move, Lead Sync, Stage Metrics

-- Create crm_stages table
CREATE TABLE IF NOT EXISTS public.crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add stage_id column to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.crm_stages(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crm_stages_workspace ON public.crm_stages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_stages_position ON public.crm_stages(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage_id);

-- Enable RLS
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;

-- RLS policies for crm_stages
DROP POLICY IF EXISTS "Users can view stages for their workspace" ON public.crm_stages;
CREATE POLICY "Users can view stages for their workspace" ON public.crm_stages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crm_stages.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage stages for their workspace" ON public.crm_stages;
CREATE POLICY "Users can manage stages for their workspace" ON public.crm_stages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crm_stages.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin', 'member')
    )
  );

-- Create default stages for existing workspaces
-- Use a DO block to avoid conflicts and ensure idempotency
DO $$
DECLARE
  ws_record RECORD;
BEGIN
  FOR ws_record IN SELECT id FROM public.workspaces LOOP
    -- Insert stages only if they don't exist for this workspace
    INSERT INTO public.crm_stages (workspace_id, name, position)
    SELECT ws_record.id, 'New', 1
    WHERE NOT EXISTS (
      SELECT 1 FROM public.crm_stages 
      WHERE workspace_id = ws_record.id AND name = 'New'
    );

    INSERT INTO public.crm_stages (workspace_id, name, position)
    SELECT ws_record.id, 'Working', 2
    WHERE NOT EXISTS (
      SELECT 1 FROM public.crm_stages 
      WHERE workspace_id = ws_record.id AND name = 'Working'
    );

    INSERT INTO public.crm_stages (workspace_id, name, position)
    SELECT ws_record.id, 'Booked', 3
    WHERE NOT EXISTS (
      SELECT 1 FROM public.crm_stages 
      WHERE workspace_id = ws_record.id AND name = 'Booked'
    );

    INSERT INTO public.crm_stages (workspace_id, name, position)
    SELECT ws_record.id, 'Closed Lost', 4
    WHERE NOT EXISTS (
      SELECT 1 FROM public.crm_stages 
      WHERE workspace_id = ws_record.id AND name = 'Closed Lost'
    );
  END LOOP;
END $$;

-- Note: lead_timeline_events is a VIEW, not a TABLE, so we cannot add CHECK constraints to it.
-- The event_type values are controlled by the view definition in 20250130000001_block8450_lead_timeline_view.sql
-- To support stage_changed event type, update the view definition to include UNION ALL clauses for stage change events.
-- For now, this migration is commented out as views don't support CHECK constraints.
--
-- If you need to add stage_changed events, you would need to:
-- 1. Create a table to store stage changes (e.g., lead_stage_changes)
-- 2. Add a UNION ALL clause to the view definition to include stage changes
-- 3. Map the stage change data to the view columns (id, lead_id, direction, event_type, subject, event_title, event_body, etc.)
--
-- ALTER TABLE public.lead_timeline_events
-- DROP CONSTRAINT IF EXISTS lead_timeline_events_event_type_check;
--
-- ALTER TABLE public.lead_timeline_events
-- ADD CONSTRAINT lead_timeline_events_event_type_check
-- CHECK (
--   event_type IN (
--     'email_sent',
--     'email_open',
--     'email_click',
--     'email_reply',
--     'tag_added',
--     'note_added',
--     'stage_changed'
--   )
-- );

