-- Add booked_at column to meetings table for tracking when meetings are confirmed
ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS booked_at timestamptz;

-- Add index for better query performance on booked meetings
CREATE INDEX IF NOT EXISTS idx_meetings_booked_at ON public.meetings(booked_at);
CREATE INDEX IF NOT EXISTS idx_meetings_user_booked ON public.meetings(user_id, booked_at);

-- Add comment for documentation
COMMENT ON COLUMN public.meetings.booked_at IS 'Timestamp when the meeting was confirmed/booked'; 