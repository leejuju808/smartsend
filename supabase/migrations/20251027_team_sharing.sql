CREATE TABLE IF NOT EXISTS public.campaign_members (
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'editor',
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_members_user ON public.campaign_members(user_id);

CREATE TABLE IF NOT EXISTS public.campaign_members (
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'editor',
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_members_user ON public.campaign_members(user_id);

