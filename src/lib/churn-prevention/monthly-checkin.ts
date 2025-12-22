/**
 * Block 23610 — Monthly Success Check-In System
 * Sends monthly metrics to roofers (cuts churn 60%)
 */

import { createClient } from '@supabase/supabase-js';
import { renderScript } from './intervention-scripts';
import { sendIntervention } from './intervention-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get monthly metrics for a workspace
 */
export async function getMonthlyMetrics(
  workspaceId: string,
  monthStart: Date
): Promise<{
  repliesCount: number;
  leadsCount: number;
  estimatedValue: number;
}> {
  const { data, error } = await supabase.rpc('get_monthly_checkin_metrics', {
    p_workspace_id: workspaceId,
    p_month_start: monthStart.toISOString().split('T')[0]
  });
  
  if (error || !data || data.length === 0) {
    return {
      repliesCount: 0,
      leadsCount: 0,
      estimatedValue: 0
    };
  }
  
  return {
    repliesCount: data[0].replies_count || 0,
    leadsCount: data[0].leads_created || 0,
    estimatedValue: parseFloat(data[0].estimated_job_value || '0')
  };
}

/**
 * Send monthly check-in to a roofer
 */
export async function sendMonthlyCheckIn(
  workspaceId: string,
  userId: string
): Promise<string> {
  // Get current month start
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Check if check-in already sent this month
  const { data: existing } = await supabase
    .from('monthly_checkins')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('checkin_month', monthStart.toISOString().split('T')[0])
    .single();
  
  if (existing) {
    // Already sent this month
    return existing.id;
  }
  
  // Get metrics
  const metrics = await getMonthlyMetrics(workspaceId, monthStart);
  
  // Send intervention
  const interventionId = await sendIntervention({
    workspaceId,
    userId,
    interventionType: 'monthly_checkin',
    scriptId: 'monthly_checkin',
    variables: {
      REPLIES_COUNT: metrics.repliesCount,
      LEADS_COUNT: metrics.leadsCount,
      ESTIMATED_VALUE: Math.round(metrics.estimatedValue).toLocaleString()
    },
    sentVia: 'both' // Email + SMS
  });
  
  // Record check-in
  const { data: checkin, error } = await supabase
    .from('monthly_checkins')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      checkin_month: monthStart.toISOString().split('T')[0],
      checkin_year: now.getFullYear(),
      replies_count: metrics.repliesCount,
      leads_created: metrics.leadsCount,
      estimated_job_value: metrics.estimatedValue,
      sent_via: 'both'
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Error recording monthly check-in:', error);
  }
  
  return checkin?.id || interventionId;
}

/**
 * Get all workspaces that need monthly check-ins
 */
export async function getWorkspacesNeedingCheckIn(): Promise<Array<{
  workspace_id: string;
  user_id: string;
}>> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = monthStart.toISOString().split('T')[0];
  
  // Get all active workspaces
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, owner_id')
    .is('deleted_at', null);
  
  if (!workspaces) {
    return [];
  }
  
  // Get workspaces that haven't received check-in this month
  const { data: checkins } = await supabase
    .from('monthly_checkins')
    .select('workspace_id')
    .eq('checkin_month', monthStartStr);
  
  const checkinWorkspaceIds = new Set(checkins?.map(c => c.workspace_id) || []);
  
  return workspaces
    .filter(w => !checkinWorkspaceIds.has(w.id))
    .map(w => ({
      workspace_id: w.id,
      user_id: w.owner_id
    }));
}






































