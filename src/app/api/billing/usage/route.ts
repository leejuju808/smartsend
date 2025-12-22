/**
 * Block 17300 — SmartSend Billing Guard v2
 * 
 * API route for getting billing usage and status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUsageStats, getBillingStatus, getUpsellTriggers } from '@/lib/billing/guard-v2';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get usage stats
    const usageStats = await getUsageStats(supabase, user.id);
    
    // Get billing status
    const billingStatus = await getBillingStatus(supabase, user.id);
    
    // Get upsell triggers
    const upsellTriggers = await getUpsellTriggers(supabase, user.id);

    // Get subscription details
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end, trial_ends_at, is_trial_active')
      .eq('owner_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      usage: usageStats,
      billingStatus,
      subscription: {
        plan: subscription?.plan,
        status: subscription?.status,
        currentPeriodEnd: subscription?.current_period_end,
        trialEndsAt: subscription?.trial_ends_at,
        isTrialActive: subscription?.is_trial_active,
      },
      upsellTriggers,
    });
  } catch (error: any) {
    console.error('Error getting billing usage:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get billing usage' },
      { status: 500 }
    );
  }
}
