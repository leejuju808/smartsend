-- Add meeting_booked column to ai_reply_events table
ALTER TABLE public.ai_reply_events
ADD COLUMN IF NOT EXISTS meeting_booked boolean DEFAULT false;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_ai_reply_events_meeting_booked ON public.ai_reply_events(meeting_booked);
CREATE INDEX IF NOT EXISTS idx_ai_reply_events_team_meeting ON public.ai_reply_events(team_id, meeting_booked); 