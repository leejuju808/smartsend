/**
 * Block 20900 — Email Sending Enforcement Helper
 * 
 * Utility to check email limits before sending and increment usage after successful send
 */

import { checkEmailLimit, incrementEmailUsage } from './enforcement-20900';
import { createSupabaseServer } from '@/lib/supabaseServer';

/**
 * Get organization ID from campaign ID
 */
async function getOrgIdFromCampaign(campaignId: string): Promise<string | null> {
  const supabase = createSupabaseServer();
  
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('org_id')
    .eq('id', campaignId)
    .single();
  
  return campaign?.org_id || null;
}

/**
 * Get organization ID from workspace ID
 */
async function getOrgIdFromWorkspace(workspaceId: string): Promise<string | null> {
  const supabase = createSupabaseServer();
  
  // Try to find org_id from workspace
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('org_id')
    .eq('id', workspaceId)
    .maybeSingle();
  
  if (workspace?.org_id) {
    return workspace.org_id;
  }
  
  // Fallback: try to find org from workspace members
  const { data: member } = await supabase
    .from('team_members')
    .select('org_id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();
  
  return member?.org_id || null;
}

/**
 * Check if email can be sent (Block 20900 enforcement)
 * Call this before sending emails
 */
export async function canSendEmail(
  orgId: string | null,
  campaignId?: string | null,
  workspaceId?: string | null,
  emailsToSend: number = 1
): Promise<{ allowed: boolean; error?: any }> {
  // Try to get org_id from various sources
  let finalOrgId = orgId;
  
  if (!finalOrgId && campaignId) {
    finalOrgId = await getOrgIdFromCampaign(campaignId);
  }
  
  if (!finalOrgId && workspaceId) {
    finalOrgId = await getOrgIdFromWorkspace(workspaceId);
  }
  
  if (!finalOrgId) {
    // If no org_id found, allow sending (fail open for backward compatibility)
    console.warn('No org_id found for email sending, allowing send');
    return { allowed: true };
  }
  
  const check = await checkEmailLimit(finalOrgId, emailsToSend);
  
  if (!check.allowed) {
    return {
      allowed: false,
      error: {
        code: 'EMAIL_LIMIT_REACHED',
        message: check.limit_amount
          ? `Email limit reached: ${check.current_count}/${check.limit_amount}`
          : 'Email limit reached',
        current_count: check.current_count,
        limit_amount: check.limit_amount,
        remaining: check.remaining,
        plan: check.plan,
      },
    };
  }
  
  return { allowed: true };
}

/**
 * Track email usage after successful send (Block 20900)
 * Call this after successfully sending emails
 */
export async function trackEmailSent(
  orgId: string | null,
  campaignId?: string | null,
  workspaceId?: string | null,
  count: number = 1
): Promise<void> {
  // Try to get org_id from various sources
  let finalOrgId = orgId;
  
  if (!finalOrgId && campaignId) {
    finalOrgId = await getOrgIdFromCampaign(campaignId);
  }
  
  if (!finalOrgId && workspaceId) {
    finalOrgId = await getOrgIdFromWorkspace(workspaceId);
  }
  
  if (!finalOrgId) {
    console.warn('No org_id found for email tracking, skipping');
    return;
  }
  
  await incrementEmailUsage(finalOrgId, count);
}
















































