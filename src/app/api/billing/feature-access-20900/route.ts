/**
 * Block 20900 — Feature Access API
 * 
 * Checks if organization has access to a specific feature
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { hasFeatureAccess, getOrgSubscription } from '@/lib/billing/enforcement-20900';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const orgId = searchParams.get('orgId');
  const feature = searchParams.get('feature');

  if (!orgId || !feature) {
    return NextResponse.json(
      { error: 'orgId and feature are required' },
      { status: 400 }
    );
  }

  try {
    const subscription = await getOrgSubscription(orgId);
    
    if (!subscription) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    const hasAccess = await hasFeatureAccess(orgId, feature);

    return NextResponse.json({
      hasAccess,
      currentPlan: subscription.plan,
      feature,
    });
  } catch (error: any) {
    console.error('Error checking feature access:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check feature access' },
      { status: 500 }
    );
  }
}
















































