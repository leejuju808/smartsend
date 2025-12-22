/**
 * Block 23610 — 90-Day Retention Play
 * When a roofer is drifting after 45 days
 */

import { createClient } from '@supabase/supabase-js';
import { sendIntervention } from './intervention-service';
import { launchCampaignLadderCampaign } from './campaign-ladder';
import { getUsageMetrics } from './monitoring-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Check if a workspace needs 90-day retention play
 */
export async function needs90DayRetentionPlay(workspaceId: string): Promise<boolean> {
  // Get workspace creation date
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('created_at')
    .eq('id', workspaceId)
    .single();
  
  if (!workspace) {
    return false;
  }
  
  const created = new Date(workspace.created_at);
  const now = new Date();
  const daysSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  
  // Only trigger if between 45-90 days
  if (daysSinceCreation < 45 || daysSinceCreation > 90) {
    return false;
  }
  
  // Check if usage has dropped
  const metrics = await getUsageMetrics(workspaceId, 7); // Last 7 days
  if (!metrics) {
    return false;
  }
  
  // Check if low activity in last 7 days
  const hasLowActivity = 
    metrics.campaigns_launched === 0 &&
    metrics.replies_received === 0 &&
    (!metrics.last_dashboard_visit || 
     (Date.now() - new Date(metrics.last_dashboard_visit).getTime()) / (1000 * 60 * 60 * 24) > 7);
  
  return hasLowActivity;
}

/**
 * Execute 90-day retention play
 */
export async function execute90DayRetentionPlay(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  // Step 1: Launch high-impact sequence
  const campaignId = await launchCampaignLadderCampaign(
    workspaceId,
    userId,
    'lead_revival'
  );
  
  if (!campaignId) {
    console.error('Failed to launch campaign for 90-day retention play');
    return false;
  }
  
  // Step 2: Send notification
  await sendIntervention({
    workspaceId,
    userId,
    interventionType: '90_day_retention_play',
    scriptId: '90_day_retention_play',
    sentVia: 'email',
    relatedCampaignId: campaignId
  });
  
  return true;
}

/**
 * Get all workspaces that need 90-day retention play
 */
export async function getWorkspacesNeeding90DayRetention(): Promise<Array<{
  workspace_id: string;
  user_id: string;
}>> {
  // Get all workspaces between 45-90 days old
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, owner_id, created_at')
    .is('deleted_at', null);
  
  if (!workspaces) {
    return [];
  }
  
  const now = Date.now();
  const results: Array<{ workspace_id: string; user_id: string }> = [];
  
  for (const workspace of workspaces) {
    const created = new Date(workspace.created_at).getTime();
    const daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);
    
    if (daysSinceCreation >= 45 && daysSinceCreation <= 90) {
      const needsPlay = await needs90DayRetentionPlay(workspace.id);
      if (needsPlay) {
        results.push({
          workspace_id: workspace.id,
          user_id: workspace.owner_id
        });
      }
    }
  }
  
  return results;
}






































