-- Campaign Analytics Database Schema
-- This file contains the SQL schema for campaign analytics functionality

-- Main campaigns table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  content TEXT,
  status VARCHAR(50) DEFAULT 'draft', -- draft, scheduled, sent, failed
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Campaign analytics table for aggregated stats
CREATE TABLE IF NOT EXISTS campaign_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  sent INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campaign_id)
);

-- Individual email tracking table
CREATE TABLE IF NOT EXISTS email_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  sent_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  bounced_at TIMESTAMP WITH TIME ZONE,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_sent_at ON campaigns(sent_at);
CREATE INDEX IF NOT EXISTS idx_campaign_stats_campaign_id ON campaign_stats(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_campaign_id ON email_tracking(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_recipient_email ON email_tracking(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_tracking_sent_at ON email_tracking(sent_at);

-- Function to update campaign stats when email tracking changes
CREATE OR REPLACE FUNCTION update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update or insert campaign stats
  INSERT INTO campaign_stats (campaign_id, sent, opened, replied, clicked, bounced, unsubscribed)
  SELECT 
    NEW.campaign_id,
    COUNT(*) FILTER (WHERE sent_at IS NOT NULL),
    COUNT(*) FILTER (WHERE opened_at IS NOT NULL),
    COUNT(*) FILTER (WHERE replied_at IS NOT NULL),
    COUNT(*) FILTER (WHERE clicked_at IS NOT NULL),
    COUNT(*) FILTER (WHERE bounced_at IS NOT NULL),
    COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)
  FROM email_tracking
  WHERE campaign_id = NEW.campaign_id
  ON CONFLICT (campaign_id) 
  DO UPDATE SET
    sent = EXCLUDED.sent,
    opened = EXCLUDED.opened,
    replied = EXCLUDED.replied,
    clicked = EXCLUDED.clicked,
    bounced = EXCLUDED.bounced,
    unsubscribed = EXCLUDED.unsubscribed,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update stats when email tracking changes
DROP TRIGGER IF EXISTS trigger_update_campaign_stats ON email_tracking;
CREATE TRIGGER trigger_update_campaign_stats
  AFTER INSERT OR UPDATE OR DELETE ON email_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_stats();

-- RLS (Row Level Security) policies
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_tracking ENABLE ROW LEVEL SECURITY;

-- Policies for campaigns table
CREATE POLICY "Users can view their own campaigns" ON campaigns
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own campaigns" ON campaigns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns" ON campaigns
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns" ON campaigns
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for campaign_stats table
CREATE POLICY "Users can view stats for their campaigns" ON campaign_stats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = campaign_stats.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

-- Policies for email_tracking table
CREATE POLICY "Users can view tracking for their campaigns" ON email_tracking
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = email_tracking.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert tracking for their campaigns" ON email_tracking
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = email_tracking.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tracking for their campaigns" ON email_tracking
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = email_tracking.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

-- Sample data for testing (optional)
-- INSERT INTO campaigns (name, subject, content, status, user_id) VALUES
-- ('Test Campaign', 'Welcome to our service', 'Thank you for signing up!', 'sent', auth.uid());

-- INSERT INTO email_tracking (campaign_id, recipient_email, recipient_name, sent_at, opened_at, replied_at) VALUES
-- ((SELECT id FROM campaigns LIMIT 1), 'test@example.com', 'Test User', NOW(), NOW() - INTERVAL '1 hour', NULL);