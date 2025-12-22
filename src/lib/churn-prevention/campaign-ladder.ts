/**
 * Block 23610 — Campaign Ladder System
 * Automatically launches campaigns to keep roofers active
 */

import { createClient } from '@supabase/supabase-js';
import { getCampaignTypeDisplayName } from './intervention-scripts';
import { sendIntervention } from './intervention-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type CampaignLadderType =
  | 'lead_revival'
  | 'free_estimate'
  | 'storm_damage'
  | 'seasonal'
  | 'referral_booster'
  | 'review_5star'
  | 'upsell_gutters'
  | 'upsell_fascia'
  | 'upsell_siding';

const CAMPAIGN_LADDER_ORDER: CampaignLadderType[] = [
  'lead_revival',
  'free_estimate',
  'storm_damage',
  'seasonal',
  'referral_booster',
  'review_5star',
  'upsell_gutters',
  'upsell_fascia',
  'upsell_siding'
];

/**
 * Get the next campaign type to launch for a workspace
 */
export async function getNextCampaignType(workspaceId: string): Promise<CampaignLadderType | null> {
  // Get campaign ladder history
  const { data: history } = await supabase
    .from('campaign_ladder_history')
    .select('campaign_type, launched_at')
    .eq('workspace_id', workspaceId)
    .order('launched_at', { ascending: false });
  
  if (!history || history.length === 0) {
    // Start with first campaign
    return CAMPAIGN_LADDER_ORDER[0];
  }
  
  // Find the last campaign type launched
  const lastCampaign = history[0];
  const lastIndex = CAMPAIGN_LADDER_ORDER.indexOf(lastCampaign.campaign_type as CampaignLadderType);
  
  if (lastIndex === -1) {
    // Unknown campaign type, start over
    return CAMPAIGN_LADDER_ORDER[0];
  }
  
  // Check if enough time has passed since last launch (30 days)
  const lastLaunch = new Date(lastCampaign.launched_at);
  const daysSinceLaunch = (Date.now() - lastLaunch.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceLaunch < 30) {
    // Too soon, don't launch yet
    return null;
  }
  
  // Get next campaign in sequence
  const nextIndex = (lastIndex + 1) % CAMPAIGN_LADDER_ORDER.length;
  return CAMPAIGN_LADDER_ORDER[nextIndex];
}

/**
 * Launch a campaign ladder campaign for a workspace
 */
export async function launchCampaignLadderCampaign(
  workspaceId: string,
  userId: string,
  campaignType: CampaignLadderType
): Promise<string | null> {
  // TODO: Implement actual campaign creation logic
  // This would create a campaign based on the type
  // For now, we'll create a placeholder campaign
  
  // Create campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({
      workspace_id: workspaceId,
      name: `${getCampaignTypeDisplayName(campaignType)} - Auto Launch`,
      status: 'active'
    })
    .select('id')
    .single();
  
  if (campaignError || !campaign) {
    console.error('Error creating campaign:', campaignError);
    return null;
  }
  
  // Record in campaign ladder history
  const { error: historyError } = await supabase
    .from('campaign_ladder_history')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      campaign_id: campaign.id,
      campaign_type: campaignType,
      launched_by: 'system'
    });
  
  if (historyError) {
    console.error('Error recording campaign ladder history:', historyError);
  }
  
  // Send notification to roofer
  await sendIntervention({
    workspaceId,
    userId,
    interventionType: 'campaign_ladder_launch',
    scriptId: 'campaign_ladder_launch',
    variables: {
      CAMPAIGN_TYPE: getCampaignTypeDisplayName(campaignType)
    },
    sentVia: 'email',
    relatedCampaignId: campaign.id
  });
  
  return campaign.id;
}

/**
 * Launch next campaign in ladder for a workspace (if due)
 */
export async function launchNextCampaignIfDue(workspaceId: string, userId: string): Promise<boolean> {
  const nextType = await getNextCampaignType(workspaceId);
  
  if (!nextType) {
    return false;
  }
  
  const campaignId = await launchCampaignLadderCampaign(workspaceId, userId, nextType);
  return campaignId !== null;
}






































