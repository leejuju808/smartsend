-- Block 212: Campaign Variant Experiments v1
-- Ensure email_events has variant_id column and supports 'sent' event type

-- Add variant_id column if it doesn't exist
ALTER TABLE public.email_events
ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.campaign_variants(id) ON DELETE SET NULL;

-- Create index for variant_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_email_events_variant_id ON public.email_events(variant_id);

-- Update check constraint to include 'sent' event type
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'email_events_event_type_check'
  ) THEN
    ALTER TABLE public.email_events 
    DROP CONSTRAINT email_events_event_type_check;
  END IF;

  -- Add new constraint with 'sent' included
  ALTER TABLE public.email_events
  ADD CONSTRAINT email_events_event_type_check 
  CHECK (event_type IN ('sent', 'open', 'click', 'delivered', 'bounced', 'replied'));
END $$;

-- Also ensure reply_threads has variant_id column
ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.campaign_variants(id) ON DELETE SET NULL;

-- Create index for variant_id on reply_threads if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_reply_threads_variant_id ON public.reply_threads(variant_id);

COMMENT ON COLUMN public.email_events.variant_id IS 'References campaign_variants.id for A/B testing attribution';
COMMENT ON COLUMN public.reply_threads.variant_id IS 'References campaign_variants.id for A/B testing attribution';










