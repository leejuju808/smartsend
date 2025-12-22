/**
 * Block 23610 — Churn Prevention Monitoring Service
 * Detects churn signals and triggers interventions
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ChurnSignal {
  signal_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
}

export interface UsageMetrics {
  campaigns_launched: number;
  campaigns_sent: number;
  replies_received: number;
  opens_count: number;
  clicks_count: number;
  dashboard_visits: number;
  last_dashboard_visit: string | null;
}

/**
 * Record a usage event (called from various parts of the app)
 */
export async function recordUsage(
  workspaceId: string,
  userId: string,
  metricType: 'campaign_launched' | 'campaign_sent' | 'reply_received' | 'open' | 'click' | 'dashboard_visit',
  count: number = 1
): Promise<void> {
  const { error } = await supabase.rpc('record_roofer_usage', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_metric_type: metricType,
    p_count: count
  });
  
  if (error) {
    console.error('Error recording usage:', error);
    throw error;
  }
}

/**
 * Detect churn signals for a workspace
 */
export async function detectChurnSignals(workspaceId: string): Promise<ChurnSignal[]> {
  const { data, error } = await supabase.rpc('detect_churn_signals', {
    p_workspace_id: workspaceId
  });
  
  if (error) {
    console.error('Error detecting churn signals:', error);
    return [];
  }
  
  return (data || []) as ChurnSignal[];
}

/**
 * Get usage metrics for a workspace
 */
export async function getUsageMetrics(
  workspaceId: string,
  days: number = 7
): Promise<UsageMetrics | null> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data, error } = await supabase
    .from('roofer_usage_metrics')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('period_start', startDate.toISOString())
    .order('period_start', { ascending: false });
  
  if (error) {
    console.error('Error fetching usage metrics:', error);
    return null;
  }
  
  if (!data || data.length === 0) {
    return {
      campaigns_launched: 0,
      campaigns_sent: 0,
      replies_received: 0,
      opens_count: 0,
      clicks_count: 0,
      dashboard_visits: 0,
      last_dashboard_visit: null
    };
  }
  
  // Aggregate metrics
  const aggregated = data.reduce((acc, metric) => ({
    campaigns_launched: acc.campaigns_launched + (metric.campaigns_launched || 0),
    campaigns_sent: acc.campaigns_sent + (metric.campaigns_sent || 0),
    replies_received: acc.replies_received + (metric.replies_received || 0),
    opens_count: acc.opens_count + (metric.opens_count || 0),
    clicks_count: acc.clicks_count + (metric.clicks_count || 0),
    dashboard_visits: acc.dashboard_visits + (metric.dashboard_visits || 0),
    last_dashboard_visit: metric.last_dashboard_visit || acc.last_dashboard_visit
  }), {
    campaigns_launched: 0,
    campaigns_sent: 0,
    replies_received: 0,
    opens_count: 0,
    clicks_count: 0,
    dashboard_visits: 0,
    last_dashboard_visit: null as string | null
  });
  
  return aggregated;
}

/**
 * Check if a workspace has active churn signals
 */
export async function hasActiveChurnSignals(workspaceId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('churn_signals')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'active');
  
  if (error) {
    console.error('Error checking churn signals:', error);
    return false;
  }
  
  return (count || 0) > 0;
}

/**
 * Create a churn signal record
 */
export async function createChurnSignal(
  workspaceId: string,
  userId: string,
  signalType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  metadata: Record<string, any> = {}
): Promise<void> {
  // Check if signal already exists
  const { data: existing } = await supabase
    .from('churn_signals')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('signal_type', signalType)
    .eq('status', 'active')
    .single();
  
  if (existing) {
    // Signal already exists, don't duplicate
    return;
  }
  
  const { error } = await supabase
    .from('churn_signals')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      signal_type: signalType,
      severity,
      metadata,
      status: 'active'
    });
  
  if (error) {
    console.error('Error creating churn signal:', error);
    throw error;
  }
}

/**
 * Mark a churn signal as resolved
 */
export async function resolveChurnSignal(
  signalId: string,
  resolvedBy: string,
  notes?: string
): Promise<void> {
  const { error } = await supabase
    .from('churn_signals')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_notes: notes
    })
    .eq('id', signalId);
  
  if (error) {
    console.error('Error resolving churn signal:', error);
    throw error;
  }
}

/**
 * Get days since workspace creation
 */
export async function getDaysSinceSignup(workspaceId: string): Promise<number> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('created_at')
    .eq('id', workspaceId)
    .single();
  
  if (error || !data) {
    return 0;
  }
  
  const created = new Date(data.created_at);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - created.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}






































