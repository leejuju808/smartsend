-- Performance Optimization & Scale Readiness
-- Speed, stability, and infrastructure polish for SmartSend v2 launch

-- ============================================
-- 1) SUPABASE OPTIMIZATION - Index Hot Tables
-- ============================================

-- Leads indexes
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_workspace ON leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id) WHERE campaign_id IS NOT NULL;

-- Threads indexes
CREATE INDEX IF NOT EXISTS idx_threads_org ON threads(org_id);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
CREATE INDEX IF NOT EXISTS idx_threads_last_activity ON threads(last_activity) WHERE last_activity IS NOT NULL;

-- Channel messages indexes
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel);
CREATE INDEX IF NOT EXISTS idx_channel_messages_direction ON channel_messages(direction);
CREATE INDEX IF NOT EXISTS idx_channel_messages_created ON channel_messages(created_at);

-- Automations indexes
CREATE INDEX IF NOT EXISTS idx_automation_rules_org ON automation_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON automation_rules(is_active) WHERE is_active = true;

-- Additional high-traffic table indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_status ON campaigns(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at);

CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_created ON email_logs(campaign_id, created_at) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);

CREATE INDEX IF NOT EXISTS idx_send_queue_status ON send_queue(status);
CREATE INDEX IF NOT EXISTS idx_send_queue_campaign ON send_queue(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_send_queue_scheduled ON send_queue(scheduled_for) WHERE scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_replies_workspace ON email_replies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_replies_created ON email_replies(created_at);

CREATE INDEX IF NOT EXISTS idx_inbound_messages_workspace ON inbound_messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_created ON inbound_messages(created_at);

-- ============================================
-- 2) MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================

-- Campaign metrics materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS channel_performance_mv AS
SELECT 
  'campaign' as channel_type,
  c.id as channel_id,
  c.name as channel_name,
  c.workspace_id,
  COUNT(DISTINCT el.id) FILTER (WHERE el.status = 'sent') as sent_count,
  COUNT(DISTINCT el.id) FILTER (WHERE el.opened_at IS NOT NULL) as opens,
  COUNT(DISTINCT el.id) FILTER (WHERE el.clicked_at IS NOT NULL) as clicks,
  COUNT(DISTINCT er.id) as replies,
  CASE 
    WHEN COUNT(DISTINCT el.id) FILTER (WHERE el.status = 'sent') > 0 
    THEN ROUND((COUNT(DISTINCT er.id)::numeric / NULLIF(COUNT(DISTINCT el.id) FILTER (WHERE el.status = 'sent'), 0)) * 100, 2)
    ELSE 0
  END as reply_rate,
  MAX(GREATEST(
    COALESCE(el.clicked_at, '1970-01-01'::timestamptz),
    COALESCE(el.opened_at, '1970-01-01'::timestamptz),
    COALESCE(el.created_at, '1970-01-01'::timestamptz)
  )) as last_activity_at
FROM campaigns c
LEFT JOIN email_logs el ON el.campaign_id = c.id
LEFT JOIN email_replies er ON er.campaign_id = c.id
GROUP BY c.id, c.name, c.workspace_id;

-- Create unique index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_perf_mv_unique ON channel_performance_mv(channel_id, channel_type, workspace_id);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_channel_perf_mv_workspace ON channel_performance_mv(workspace_id);
CREATE INDEX IF NOT EXISTS idx_channel_perf_mv_last_activity ON channel_performance_mv(last_activity_at DESC NULLS LAST);

-- Grant access
GRANT SELECT ON channel_performance_mv TO authenticated, anon;

-- Refresh function for materialized views
CREATE OR REPLACE FUNCTION refresh_channel_perf()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY channel_performance_mv;
$$;

-- Daily analytics rollup materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_analytics_mv AS
SELECT 
  date_trunc('day', created_at)::date as day,
  workspace_id,
  COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opens,
  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicks,
  COUNT(*) FILTER (WHERE status = 'sent') - COUNT(*) FILTER (WHERE opened_at IS NULL AND clicked_at IS NULL) as delivered_count
FROM email_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY day, workspace_id;

-- Create unique index on daily analytics
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_analytics_mv_unique ON daily_analytics_mv(day, workspace_id);

-- Grant access
GRANT SELECT ON daily_analytics_mv TO authenticated, anon;

-- Refresh function for daily analytics
CREATE OR REPLACE FUNCTION refresh_daily_analytics()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_analytics_mv;
$$;

-- ============================================
-- 3) MESSAGE QUEUE SYSTEM
-- ============================================

-- Enhanced send queue table (if not exists)
CREATE TABLE IF NOT EXISTS send_queue_optimized (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  workspace_id uuid,
  type text NOT NULL CHECK (type IN ('email', 'whatsapp', 'sms', 'linkedin')),
  data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'sent', 'failed', 'retry')),
  priority int DEFAULT 0,
  attempt_count int DEFAULT 0,
  max_attempts int DEFAULT 3,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  error_message text
);

-- Indexes for queue
CREATE INDEX IF NOT EXISTS idx_send_queue_opt_status ON send_queue_optimized(status);
CREATE INDEX IF NOT EXISTS idx_send_queue_opt_scheduled ON send_queue_optimized(scheduled_for) WHERE status IN ('pending', 'queued');
CREATE INDEX IF NOT EXISTS idx_send_queue_opt_org ON send_queue_optimized(org_id);
CREATE INDEX IF NOT EXISTS idx_send_queue_opt_workspace ON send_queue_optimized(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_send_queue_opt_type ON send_queue_optimized(type);

-- RLS on queue
ALTER TABLE send_queue_optimized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "send_queue_opt_service_role" ON send_queue_optimized
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- 4) PERFORMANCE MONITORING HELPER
-- ============================================

-- Function to get slow queries
CREATE OR REPLACE FUNCTION get_slow_queries()
RETURNS TABLE (
  query text,
  calls bigint,
  total_time numeric,
  mean_time numeric,
  max_time numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    LEFT(query, 200) as query,
    calls,
    ROUND(total_time::numeric, 2) as total_time,
    ROUND(mean_time::numeric, 2) as mean_time,
    ROUND(max_time::numeric, 2) as max_time
  FROM pg_stat_statements
  WHERE mean_time > 100
  ORDER BY mean_time DESC
  LIMIT 20;
$$;

-- ============================================
-- 5) AUTOMATIC VACUUM AND ANALYZE
-- ============================================

-- Enable auto vacuum on hot tables
ALTER TABLE leads SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE leads SET (autovacuum_analyze_scale_factor = 0.02);

ALTER TABLE email_logs SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE email_logs SET (autovacuum_analyze_scale_factor = 0.02);

ALTER TABLE send_queue SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE send_queue SET (autovacuum_analyze_scale_factor = 0.05);

-- ============================================
-- 6) COMPOSITE INDEXES FOR COMMON QUERIES
-- ============================================

-- Campaign queries by workspace and status
CREATE INDEX IF NOT EXISTS idx_campaigns_ws_status_created 
  ON campaigns(workspace_id, status, created_at DESC);

-- Email logs for analytics queries
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_created_status 
  ON email_logs(campaign_id, created_at DESC, status) 
  WHERE campaign_id IS NOT NULL;

-- Inbox thread queries
CREATE INDEX IF NOT EXISTS idx_threads_workspace_status_activity 
  ON email_threads(workspace_id, status, last_activity DESC);

COMMENT ON MATERIALIZED VIEW channel_performance_mv IS 
  'Materialized view for fast channel performance analytics. Refresh nightly with refresh_channel_perf().';

COMMENT ON MATERIALIZED VIEW daily_analytics_mv IS 
  'Materialized view for daily analytics rollups. Refresh nightly with refresh_daily_analytics().';

