-- Email Tracking Events Migration
-- This migration adds comprehensive email tracking capabilities

-- Update existing email_events table to support reply tracking
ALTER TABLE IF EXISTS public.email_events 
ADD COLUMN IF NOT EXISTS recipient_email citext,
ADD COLUMN IF NOT EXISTS type text CHECK (type IN ('open', 'click', 'reply'));

-- Create index for email tracking queries
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_type_email 
ON public.email_events (campaign_id, type, recipient_email);

-- Create index for email-based queries
CREATE INDEX IF NOT EXISTS idx_email_events_email 
ON public.email_events (recipient_email);

-- Create index for type-based queries
CREATE INDEX IF NOT EXISTS idx_email_events_type 
ON public.email_events (type);

-- Add RLS policy for email_events if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'email_events' 
        AND policyname = 'email_events_select_own'
    ) THEN
        CREATE POLICY "email_events_select_own"
        ON public.email_events FOR SELECT
        USING (auth.uid() = user_id);
    END IF;
END $$;

-- Ensure campaign_recipients table has tracking columns
ALTER TABLE IF EXISTS public.campaign_recipients 
ADD COLUMN IF NOT EXISTS open_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS click_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS reply_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_open_at timestamptz,
ADD COLUMN IF NOT EXISTS last_click_at timestamptz,
ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;

-- Create indexes for campaign_recipients tracking
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_tracking 
ON public.campaign_recipients (campaign_id, open_count, click_count, reply_count);

-- Add function to update tracking counts
CREATE OR REPLACE FUNCTION update_tracking_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'open' THEN
        UPDATE public.campaign_recipients 
        SET open_count = open_count + 1, last_open_at = NEW.created_at
        WHERE campaign_id = NEW.campaign_id AND email = NEW.recipient_email;
    ELSIF NEW.type = 'click' THEN
        UPDATE public.campaign_recipients 
        SET click_count = click_count + 1, last_click_at = NEW.created_at
        WHERE campaign_id = NEW.campaign_id AND email = NEW.recipient_email;
    ELSIF NEW.type = 'reply' THEN
        UPDATE public.campaign_recipients 
        SET reply_count = reply_count + 1, last_reply_at = NEW.created_at
        WHERE campaign_id = NEW.campaign_id AND email = NEW.recipient_email;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic tracking count updates
DROP TRIGGER IF EXISTS trg_update_tracking_counts ON public.email_events;
CREATE TRIGGER trg_update_tracking_counts
    AFTER INSERT ON public.email_events
    FOR EACH ROW
    EXECUTE FUNCTION update_tracking_counts(); 