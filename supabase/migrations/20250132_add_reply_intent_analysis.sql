-- Add reply intent analysis and meeting tracking
-- This migration adds the core functionality for SmartSend's reply-intent → ICS feature

-- 1. Add intent analysis fields to email_replies table
ALTER TABLE public.email_replies 
ADD COLUMN IF NOT EXISTS intent_analysis JSONB,
ADD COLUMN IF NOT EXISTS meeting_booked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ics_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100);

-- 2. Create meeting_invites table to track generated ICS files
CREATE TABLE IF NOT EXISTS public.meeting_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reply_id UUID REFERENCES public.email_replies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  ics_data TEXT NOT NULL,
  summary TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  organizer_name TEXT NOT NULL,
  organizer_email TEXT NOT NULL,
  attendee_name TEXT NOT NULL,
  attendee_email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_replies_intent ON public.email_replies(meeting_booked, confidence_score);
CREATE INDEX IF NOT EXISTS idx_email_replies_campaign_contact ON public.email_replies(campaign_contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_invites_contact ON public.meeting_invites(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_invites_status ON public.meeting_invites(status);

-- 4. Add reply tracking to campaign_contacts if not exists
ALTER TABLE public.campaign_contacts 
ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0;

-- 5. Create function to calculate MB/100 (Meetings Booked per 100 Replies)
CREATE OR REPLACE FUNCTION public.calculate_mb_100(p_owner UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE(
  total_replies INTEGER,
  meetings_booked INTEGER,
  mb_100 DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(r.*)::INTEGER as total_replies,
    COUNT(r.*) FILTER (WHERE r.meeting_booked = true)::INTEGER as meetings_booked,
    CASE 
      WHEN COUNT(r.*) > 0 THEN 
        ROUND((COUNT(r.*) FILTER (WHERE r.meeting_booked = true)::DECIMAL / COUNT(r.*)::DECIMAL) * 100, 2)
      ELSE 0 
    END as mb_100
  FROM public.email_replies r
  JOIN public.campaign_contacts cc ON r.campaign_contact_id = cc.id
  JOIN public.campaigns c ON cc.campaign_id = c.id
  WHERE c.owner = p_owner
    AND r.created_at >= NOW() - INTERVAL '1 day' * p_days;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create function to get reply intent analytics
CREATE OR REPLACE FUNCTION public.get_reply_intent_analytics(p_owner UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE(
  total_replies INTEGER,
  high_confidence_meetings INTEGER,
  human_review_needed INTEGER,
  no_intent INTEGER,
  avg_confidence DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(r.*)::INTEGER as total_replies,
    COUNT(r.*) FILTER (WHERE r.confidence_score >= 70)::INTEGER as high_confidence_meetings,
    COUNT(r.*) FILTER (WHERE r.confidence_score >= 40 AND r.confidence_score < 70)::INTEGER as human_review_needed,
    COUNT(r.*) FILTER (WHERE r.confidence_score < 40)::INTEGER as no_intent,
    ROUND(AVG(r.confidence_score), 2) as avg_confidence
  FROM public.email_replies r
  JOIN public.campaign_contacts cc ON r.campaign_contact_id = cc.id
  JOIN public.campaigns c ON cc.campaign_id = c.id
  WHERE c.owner = p_owner
    AND r.created_at >= NOW() - INTERVAL '1 day' * p_days
    AND r.confidence_score IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Enable RLS on new table
ALTER TABLE public.meeting_invites ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS policies for meeting_invites
CREATE POLICY "Users can view own meeting invites" ON public.meeting_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaign_contacts cc
      JOIN public.campaigns c ON cc.campaign_id = c.id
      WHERE cc.id = meeting_invites.contact_id
        AND c.owner = auth.uid()
    )
  );

CREATE POLICY "Users can insert own meeting invites" ON public.meeting_invites
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaign_contacts cc
      JOIN public.campaigns c ON cc.campaign_id = c.id
      WHERE cc.id = meeting_invites.contact_id
        AND c.owner = auth.uid()
    )
  );

CREATE POLICY "Users can update own meeting invites" ON public.meeting_invites
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.campaign_contacts cc
      JOIN public.campaigns c ON cc.campaign_id = c.id
      WHERE cc.id = meeting_invites.contact_id
        AND c.owner = auth.uid()
    )
  );

-- 9. Add comment for documentation
COMMENT ON TABLE public.meeting_invites IS 'Tracks ICS calendar invites generated from reply intent detection';
COMMENT ON FUNCTION public.calculate_mb_100 IS 'Calculates Meetings Booked per 100 Replies (MB/100) metric for SmartSend';
COMMENT ON FUNCTION public.get_reply_intent_analytics IS 'Provides analytics on reply intent detection performance'; 