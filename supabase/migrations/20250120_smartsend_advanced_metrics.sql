-- SmartSend Advanced Metrics + Hourly Caps + Bounce Webhooks
-- Run this in your Supabase SQL editor

-- 1. EXTEND CAMPAIGNS with step-based metrics
ALTER TABLE IF EXISTS public.campaigns 
ADD COLUMN IF NOT EXISTS step_count int DEFAULT 1;

-- 2. EXTEND SEQUENCE_STEPS with step_index for tracking
ALTER TABLE IF EXISTS public.sequence_steps 
ADD COLUMN IF NOT EXISTS step_index int DEFAULT 1;

-- Backfill step_index if not exists
UPDATE public.sequence_steps 
SET step_index = step_number 
WHERE step_index IS NULL;

-- 3. CREATE MAILBOXES table for warmup and hourly caps
CREATE TABLE IF NOT EXISTS public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  domain text not null,
  provider text not null, -- 'ses', 'mailgun', 'mailersend'
  daily_cap int not null default 50,
  hourly_cap int not null default 10,
  warmup_enabled boolean not null default false,
  warmup_start_date date,
  warmup_current_cap int not null default 0,
  warmup_increment int not null default 5,
  warmup_max_cap int not null default 200,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, email)
);

-- 4. CREATE DOMAIN_HOURLY_COUNTERS for per-domain hourly limits
CREATE TABLE IF NOT EXISTS public.domain_hourly_counters (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  hour_start timestamptz not null,
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  unique(domain, user_id, hour_start)
);

-- 5. EXTEND TRACKING_EVENTS with step_index for per-step metrics
ALTER TABLE IF EXISTS public.tracking_events 
ADD COLUMN IF NOT EXISTS step_index int DEFAULT 1;

-- 6. CREATE CAMPAIGN_STEP_METRICS for aggregated per-step stats
CREATE TABLE IF NOT EXISTS public.campaign_step_metrics (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_index int not null,
  unique_opens int not null default 0,
  unique_clicks int not null default 0,
  total_opens int not null default 0,
  total_clicks int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, step_index)
);

-- 7. CREATE BOUNCE_EVENTS table for bounce tracking
CREATE TABLE IF NOT EXISTS public.bounce_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email text not null,
  domain text not null,
  bounce_type text not null check (bounce_type in ('hard', 'soft', 'complaint')),
  provider text not null, -- 'ses', 'mailgun', 'mailersend'
  provider_message_id text,
  provider_bounce_id text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

-- 8. CREATE SUPPRESSED_CONTACTS for bounced/complained contacts
CREATE TABLE IF NOT EXISTS public.suppressed_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email text not null,
  domain text not null,
  reason text not null check (reason in ('bounce', 'complaint', 'unsubscribe')),
  source text not null, -- 'webhook', 'manual', 'api'
  created_at timestamptz not null default now(),
  unique(user_id, email)
);

-- 9. CREATE INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_mailboxes_user_domain ON public.mailboxes(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_mailboxes_warmup ON public.mailboxes(warmup_enabled, warmup_start_date);
CREATE INDEX IF NOT EXISTS idx_domain_hourly_counters_domain_hour ON public.domain_hourly_counters(domain, hour_start);
CREATE INDEX IF NOT EXISTS idx_tracking_events_step ON public.tracking_events(step_index);
CREATE INDEX IF NOT EXISTS idx_campaign_step_metrics_campaign_step ON public.campaign_step_metrics(campaign_id, step_index);
CREATE INDEX IF NOT EXISTS idx_bounce_events_email ON public.bounce_events(email);
CREATE INDEX IF NOT EXISTS idx_suppressed_contacts_email ON public.suppressed_contacts(email);

-- 10. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_hourly_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_step_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bounce_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_contacts ENABLE ROW LEVEL SECURITY;

-- 11. CREATE RLS POLICIES
-- Mailboxes
CREATE POLICY "mailboxes_select_own" ON public.mailboxes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mailboxes_insert_own" ON public.mailboxes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mailboxes_update_own" ON public.mailboxes FOR UPDATE USING (auth.uid() = user_id);

-- Domain hourly counters (service role can access all)
CREATE POLICY "domain_hourly_counters_select_all" ON public.domain_hourly_counters FOR SELECT USING (true);
CREATE POLICY "domain_hourly_counters_insert_all" ON public.domain_hourly_counters FOR INSERT WITH CHECK (true);
CREATE POLICY "domain_hourly_counters_update_all" ON public.domain_hourly_counters FOR UPDATE USING (true);

-- Campaign step metrics
CREATE POLICY "campaign_step_metrics_select_own" ON public.campaign_step_metrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.campaigns WHERE id = campaign_id AND user_id = auth.uid())
);
CREATE POLICY "campaign_step_metrics_insert_own" ON public.campaign_step_metrics FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.campaigns WHERE id = campaign_id AND user_id = auth.uid())
);
CREATE POLICY "campaign_step_metrics_update_own" ON public.campaign_step_metrics FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.campaigns WHERE id = campaign_id AND user_id = auth.uid())
);

-- Bounce events
CREATE POLICY "bounce_events_select_own" ON public.bounce_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bounce_events_insert_all" ON public.bounce_events FOR INSERT WITH CHECK (true); -- Webhooks need access

-- Suppressed contacts
CREATE POLICY "suppressed_contacts_select_own" ON public.suppressed_contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "suppressed_contacts_insert_all" ON public.suppressed_contacts FOR INSERT WITH CHECK (true); -- Webhooks need access

-- 12. CREATE FUNCTIONS for metrics and caps

-- Function to increment step metrics
CREATE OR REPLACE FUNCTION increment_campaign_step_metrics(
  p_campaign_id uuid,
  p_step_index int,
  p_type text -- 'open' or 'click'
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.campaign_step_metrics (campaign_id, step_index, unique_opens, unique_clicks, total_opens, total_clicks)
  VALUES (p_campaign_id, p_step_index, 
          CASE WHEN p_type = 'open' THEN 1 ELSE 0 END,
          CASE WHEN p_type = 'click' THEN 1 ELSE 0 END,
          CASE WHEN p_type = 'open' THEN 1 ELSE 0 END,
          CASE WHEN p_type = 'click' THEN 1 ELSE 0 END)
  ON CONFLICT (campaign_id, step_index)
  DO UPDATE SET
    unique_opens = CASE WHEN p_type = 'open' THEN campaign_step_metrics.unique_opens + 1 ELSE campaign_step_metrics.unique_opens END,
    unique_clicks = CASE WHEN p_type = 'click' THEN campaign_step_metrics.unique_clicks + 1 ELSE campaign_step_metrics.unique_clicks END,
    total_opens = CASE WHEN p_type = 'open' THEN campaign_step_metrics.total_opens + 1 ELSE campaign_step_metrics.total_opens END,
    total_clicks = CASE WHEN p_type = 'click' THEN campaign_step_metrics.total_clicks + 1 ELSE campaign_step_metrics.total_clicks END,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check hourly domain cap
CREATE OR REPLACE FUNCTION check_domain_hourly_cap(
  p_domain text,
  p_user_id uuid,
  p_hour_start timestamptz
)
RETURNS boolean AS $$
DECLARE
  v_current_count int;
  v_mailbox_cap int;
BEGIN
  -- Get current count for this domain/hour
  SELECT COALESCE(sent_count, 0) INTO v_current_count
  FROM public.domain_hourly_counters
  WHERE domain = p_domain AND user_id = p_user_id AND hour_start = p_hour_start;
  
  -- Get mailbox hourly cap for this domain
  SELECT hourly_cap INTO v_mailbox_cap
  FROM public.mailboxes
  WHERE domain = p_domain AND user_id = p_user_id
  LIMIT 1;
  
  -- Default cap if no mailbox found
  IF v_mailbox_cap IS NULL THEN
    v_mailbox_cap := 10;
  END IF;
  
  -- Return true if under cap
  RETURN v_current_count < v_mailbox_cap;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment hourly counter
CREATE OR REPLACE FUNCTION increment_domain_hourly_counter(
  p_domain text,
  p_user_id uuid,
  p_hour_start timestamptz
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.domain_hourly_counters (domain, user_id, hour_start, sent_count)
  VALUES (p_domain, p_user_id, p_hour_start, 1)
  ON CONFLICT (domain, user_id, hour_start)
  DO UPDATE SET sent_count = domain_hourly_counters.sent_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get warmup cap for a mailbox
CREATE OR REPLACE FUNCTION get_mailbox_warmup_cap(
  p_mailbox_id uuid
)
RETURNS int AS $$
DECLARE
  v_mailbox record;
  v_days_since_start int;
  v_warmup_cap int;
BEGIN
  SELECT * INTO v_mailbox FROM public.mailboxes WHERE id = p_mailbox_id;
  
  IF NOT FOUND OR NOT v_mailbox.warmup_enabled THEN
    RETURN v_mailbox.daily_cap;
  END IF;
  
  -- Calculate days since warmup start
  v_days_since_start := EXTRACT(DAY FROM (now()::date - v_mailbox.warmup_start_date));
  
  -- Calculate warmup cap: start_cap + (days * increment), capped at max_cap
  v_warmup_cap := LEAST(
    v_mailbox.warmup_current_cap + (v_days_since_start * v_mailbox.warmup_increment),
    v_mailbox.warmup_max_cap
  );
  
  -- Return the lower of warmup cap or daily cap
  RETURN LEAST(v_warmup_cap, v_mailbox.daily_cap);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. GRANT EXECUTE on functions to authenticated users
GRANT EXECUTE ON FUNCTION increment_campaign_step_metrics(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION check_domain_hourly_cap(text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_domain_hourly_counter(text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mailbox_warmup_cap(uuid) TO authenticated;

-- 14. GRANT EXECUTE on functions to service role (for cron jobs)
GRANT EXECUTE ON FUNCTION increment_campaign_step_metrics(uuid, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION check_domain_hourly_cap(text, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION increment_domain_hourly_counter(text, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION get_mailbox_warmup_cap(uuid) TO service_role; 