/**
 * Block 23720 — Check Upgrade Triggers API
 * 
 * Checks if user should see upgrade prompts based on their current usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectUpgradeTriggers } from '@/lib/upsell/trigger-detection';
import { PLAN_LIMITS, PlanId } from '@/src/lib/billing/plan-limits';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    const workspaceId = membership.workspace_id;

    // Get current plan
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('plan_key')
      .eq('id', workspaceId)
      .single();

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 400 });
    }

    const currentPlan = (workspace.plan_key || 'starter') as PlanId;

    // Check if we should show triggers (cooldown check)
    const { data: recentTriggers } = await supabase
      .from('upgrade_trigger_events')
      .select('trigger_type, shown_at')
      .eq('workspace_id', workspaceId)
      .eq('upgraded_at', null)
      .gte('shown_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

    const recentTriggerTypes = new Set(recentTriggers?.map(t => t.trigger_type) || []);

    // Detect all triggers
    const allTriggers = await detectUpgradeTriggers(workspaceId, user.id, currentPlan);

    // Filter out triggers shown recently (cooldown)
    const activeTriggers = allTriggers.filter(
      trigger => !recentTriggerTypes.has(trigger.triggerType)
    );

    // Return the highest priority trigger (or all if needed)
    // Priority: campaign_limit_hit > email_limit_approaching > high_engagement > first_replies > first_campaign
    const priorityOrder = [
      'campaign_limit_hit',
      'email_limit_approaching',
      'high_engagement',
      'first_replies_received',
      'first_campaign_launched',
    ];

    const sortedTriggers = activeTriggers.sort(
      (a, b) => priorityOrder.indexOf(a.triggerType) - priorityOrder.indexOf(b.triggerType)
    );

    return NextResponse.json({
      hasTriggers: activeTriggers.length > 0,
      triggers: activeTriggers,
      primaryTrigger: sortedTriggers[0] || null,
      currentPlan,
    });
  } catch (error: any) {
    console.error('Error checking upgrade triggers:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}






































