/**
 * Block 23720 — Upgrade Trigger Detection Service
 * 
 * Detects when users should be shown upgrade prompts based on:
 * - Campaign limits
 * - Email limits
 * - High engagement
 * - Business growth signals
 */

import { createClient } from '@/lib/supabase/server';
import { PLAN_LIMITS, PlanId } from '@/src/lib/billing/plan-limits';

export type UpgradeTriggerType =
  | 'campaign_limit_hit'
  | 'email_limit_approaching'
  | 'high_engagement'
  | 'crew_size_growth'
  | 'first_campaign_launched'
  | 'first_replies_received'
  | 'storm_season_detected'
  | 'multi_city_expansion';

export interface UpgradeTriggerData {
  triggerType: UpgradeTriggerType;
  currentPlan: PlanId;
  suggestedPlan: PlanId;
  context: Record<string, any>;
  message: string;
  script: string; // The exact script to show
}

/**
 * Check if user hit campaign limit
 */
export async function detectCampaignLimitTrigger(
  workspaceId: string,
  userId: string,
  currentPlan: PlanId
): Promise<UpgradeTriggerData | null> {
  const supabase = createClient();
  
  // Get current plan limits
  const planLimits = PLAN_LIMITS[currentPlan];
  if (!planLimits || planLimits.maxActiveCampaigns === null) {
    return null; // Unlimited campaigns, no trigger
  }

  // Count active campaigns
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, status')
    .eq('workspace_id', workspaceId)
    .in('status', ['draft', 'scheduled', 'running']);

  if (error) {
    console.error('Error checking campaign limit:', error);
    return null;
  }

  const activeCount = campaigns?.length || 0;

  // Check if limit is hit
  if (activeCount >= planLimits.maxActiveCampaigns) {
    const suggestedPlan = currentPlan === 'starter' ? 'growth' : 'domination';
    
    return {
      triggerType: 'campaign_limit_hit',
      currentPlan,
      suggestedPlan: suggestedPlan as PlanId,
      context: {
        activeCampaigns: activeCount,
        maxCampaigns: planLimits.maxActiveCampaigns,
      },
      message: `You're on the ${planLimits.name} plan (${planLimits.maxActiveCampaigns} campaign). Upgrade to ${suggestedPlan === 'growth' ? 'Growth' : 'Domination'} to launch this campaign and run multi-step follow-up.`,
      script: currentPlan === 'starter'
        ? "You're getting traction already. Growth will let you run up to 3 campaigns at once, which means: ✔ Lead revival ✔ Free estimate ✔ Storm outreach all running automatically. Want me to upgrade you so we can launch your next campaign today?"
        : "You're ready for unlimited campaigns. Domination is built for roofers who want full automation and consistent booked estimates across multiple crews.",
    };
  }

  return null;
}

/**
 * Check if user is approaching email limit (80% threshold)
 */
export async function detectEmailLimitTrigger(
  workspaceId: string,
  userId: string,
  currentPlan: PlanId
): Promise<UpgradeTriggerData | null> {
  const supabase = createClient();
  
  const planLimits = PLAN_LIMITS[currentPlan];
  if (!planLimits || planLimits.monthlyEmailLimit === null) {
    return null; // Unlimited emails
  }

  // Get current month's email usage
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('plan_emails_sent_this_period, plan_period_start')
    .eq('id', workspaceId)
    .single();

  const emailsSent = workspace?.plan_emails_sent_this_period || 0;
  const limit = planLimits.monthlyEmailLimit;
  const usagePercent = (emailsSent / limit) * 100;

  // Trigger at 80% usage
  if (usagePercent >= 80 && usagePercent < 100) {
    const suggestedPlan = currentPlan === 'starter' ? 'growth' : 'domination';
    
    return {
      triggerType: 'email_limit_approaching',
      currentPlan,
      suggestedPlan: suggestedPlan as PlanId,
      context: {
        emailsSent,
        emailLimit: limit,
        usagePercent: Math.round(usagePercent),
      },
      message: `Looks like your campaigns are performing well — you're close to the limit (${emailsSent}/${limit} emails). Upgrade to ${suggestedPlan === 'growth' ? 'Growth' : 'Domination'} for ${suggestedPlan === 'growth' ? '2,000' : '20,000'} emails/month and advanced follow-up.`,
      script: `You're capped at ${limit} emails this month on ${planLimits.name}. ${suggestedPlan === 'growth' ? 'Growth' : 'Domination'} gives you ${suggestedPlan === 'growth' ? '2,000' : '20,000'} and advanced follow-up — perfect for booking more estimates consistently.`,
    };
  }

  return null;
}

/**
 * Check if user has high engagement (10+ replies in a week)
 */
export async function detectHighEngagementTrigger(
  workspaceId: string,
  userId: string,
  currentPlan: PlanId
): Promise<UpgradeTriggerData | null> {
  if (currentPlan === 'domination') {
    return null; // Already on highest plan
  }

  const supabase = createClient();
  
  // Count replies in last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const { data: replies, error } = await supabase
    .from('reply_detections')
    .select('id')
    .eq('workspace_id', workspaceId)
    .gte('created_at', weekAgo.toISOString())
    .in('intent', ['positive', 'question', 'routing']); // Only count meaningful replies

  if (error) {
    console.error('Error checking engagement:', error);
    return null;
  }

  const replyCount = replies?.length || 0;

  // Trigger if 10+ replies in a week
  if (replyCount >= 10) {
    const suggestedPlan = currentPlan === 'starter' ? 'growth' : 'domination';
    
    return {
      triggerType: 'high_engagement',
      currentPlan,
      suggestedPlan: suggestedPlan as PlanId,
      context: {
        repliesThisWeek: replyCount,
      },
      message: `Your campaigns are heating up — you've received ${replyCount} replies this week! ${suggestedPlan === 'growth' ? 'Growth' : 'Domination'} unlocks more sequences to convert these replies into booked estimates.`,
      script: `Your campaigns are heating up — ${suggestedPlan === 'growth' ? 'Growth' : 'Domination'} unlocks more sequences to convert these replies into booked estimates.`,
    };
  }

  return null;
}

/**
 * Check if this is first campaign launch (Day 1 trigger)
 */
export async function detectFirstCampaignTrigger(
  workspaceId: string,
  userId: string,
  currentPlan: PlanId
): Promise<UpgradeTriggerData | null> {
  if (currentPlan !== 'starter') {
    return null; // Only for Starter users
  }

  const supabase = createClient();
  
  // Check if this is their first campaign
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(2);

  if (error || !campaigns || campaigns.length !== 1) {
    return null; // Not first campaign or error
  }

  const firstCampaign = campaigns[0];
  const hoursSinceLaunch = (Date.now() - new Date(firstCampaign.created_at).getTime()) / (1000 * 60 * 60);

  // Show trigger within 24 hours of first campaign
  if (hoursSinceLaunch <= 24) {
    return {
      triggerType: 'first_campaign_launched',
      currentPlan,
      suggestedPlan: 'growth',
      context: {
        campaignId: firstCampaign.id,
        hoursSinceLaunch: Math.round(hoursSinceLaunch),
      },
      message: "You're getting traction already. Growth will let you run up to 3 campaigns at once, which means: ✔ Lead revival ✔ Free estimate ✔ Storm outreach all running automatically.",
      script: "You're getting traction already. Growth will let you run up to 3 campaigns at once, which means: ✔ Lead revival ✔ Free estimate ✔ Storm outreach all running automatically. Want me to upgrade you so we can launch your next campaign today?",
    };
  }

  return null;
}

/**
 * Check if user received first replies (Day 5 trigger)
 */
export async function detectFirstRepliesTrigger(
  workspaceId: string,
  userId: string,
  currentPlan: PlanId
): Promise<UpgradeTriggerData | null> {
  if (currentPlan !== 'starter') {
    return null; // Only for Starter users
  }

  const supabase = createClient();
  
  // Get first campaign date
  const { data: firstCampaign } = await supabase
    .from('campaigns')
    .select('created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!firstCampaign) {
    return null;
  }

  const campaignDate = new Date(firstCampaign.created_at);
  const daysSinceCampaign = (Date.now() - campaignDate.getTime()) / (1000 * 60 * 60 * 24);

  // Check if it's around Day 5 (4-6 days)
  if (daysSinceCampaign >= 4 && daysSinceCampaign <= 6) {
    // Check if they have any replies
    const { data: replies } = await supabase
      .from('reply_detections')
      .select('id')
      .eq('workspace_id', workspaceId)
      .limit(1);

    if (replies && replies.length > 0) {
      return {
        triggerType: 'first_replies_received',
        currentPlan,
        suggestedPlan: 'growth',
        context: {
          daysSinceCampaign: Math.round(daysSinceCampaign),
        },
        message: "You're getting replies — great start. Growth unlocks multi-campaign automation so you can run: • Lead revival • Free estimate • Storm outreach …all at the same time.",
        script: "You're getting replies — great start. Growth unlocks multi-campaign automation so you can run: • Lead revival • Free estimate • Storm outreach …all at the same time. Want me to upgrade your account?",
      };
    }
  }

  return null;
}

/**
 * Main function to detect all applicable upgrade triggers
 */
export async function detectUpgradeTriggers(
  workspaceId: string,
  userId: string,
  currentPlan: PlanId
): Promise<UpgradeTriggerData[]> {
  const triggers: UpgradeTriggerData[] = [];

  // Check all trigger types
  const campaignLimit = await detectCampaignLimitTrigger(workspaceId, userId, currentPlan);
  if (campaignLimit) triggers.push(campaignLimit);

  const emailLimit = await detectEmailLimitTrigger(workspaceId, userId, currentPlan);
  if (emailLimit) triggers.push(emailLimit);

  const highEngagement = await detectHighEngagementTrigger(workspaceId, userId, currentPlan);
  if (highEngagement) triggers.push(highEngagement);

  const firstCampaign = await detectFirstCampaignTrigger(workspaceId, userId, currentPlan);
  if (firstCampaign) triggers.push(firstCampaign);

  const firstReplies = await detectFirstRepliesTrigger(workspaceId, userId, currentPlan);
  if (firstReplies) triggers.push(firstReplies);

  return triggers;
}






































