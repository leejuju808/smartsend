-- Add campaign_id to inbox_threads for better campaign tracking
ALTER TABLE IF EXISTS public.inbox_threads 
ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- Create index for campaign_id lookups
CREATE INDEX IF NOT EXISTS idx_inbox_threads_campaign ON public.inbox_threads(campaign_id);

-- Update the unique constraint to include campaign_id
DROP INDEX IF EXISTS uniq_inbox_thread_key;
CREATE UNIQUE INDEX uniq_inbox_thread_key 
ON public.inbox_threads(workspace_id, contact_id, campaign_id, subject); 