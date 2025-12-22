/**
 * Block 23720 — Record Upgrade Trigger Helper
 * 
 * Server-side helper to record upgrade triggers when events occur
 */

import { createClient } from '@/lib/supabase/server';
import { PlanId } from '@/src/lib/billing/plan-limits';
import { UpgradeTriggerType } from './trigger-detection';

interface RecordTriggerOptions {
  workspaceId: string;
  userId: string;
  triggerType: UpgradeTriggerType;
  currentPlan: PlanId;
  suggestedPlan: PlanId;
  triggerData?: Record<string, any>;
}

/**
 * Record an upgrade trigger event (non-blocking)
 */
export async function recordUpgradeTrigger(options: RecordTriggerOptions): Promise<void> {
  try {
    const supabase = createClient();
    
    // Check if we should show this trigger (cooldown check)
    const { data: recentTrigger } = await supabase
      .from('upgrade_trigger_events')
      .select('id')
      .eq('workspace_id', options.workspaceId)
      .eq('trigger_type', options.triggerType)
      .is('upgraded_at', null)
      .gte('shown_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    // If shown recently, don't record again
    if (recentTrigger) {
      return;
    }

    // Record the trigger event
    await supabase
      .from('upgrade_trigger_events')
      .insert({
        workspace_id: options.workspaceId,
        user_id: options.userId,
        trigger_type: options.triggerType,
        current_plan: options.currentPlan,
        suggested_plan: options.suggestedPlan,
        trigger_data: options.triggerData || {},
        shown_at: null, // Will be set when modal is shown
      });

    // Don't throw errors - this is non-critical
  } catch (error) {
    console.error('Error recording upgrade trigger:', error);
    // Silently fail - upgrade triggers are nice-to-have, not critical
  }
}






































