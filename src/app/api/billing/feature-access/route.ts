/**
 * Block 9100 — Feature Access API
 * Checks if account has access to a specific feature
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { requireFeature, getAccountBillingStatus } from '@/lib/billing/guard';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const accountId = searchParams.get('accountId');
  const feature = searchParams.get('feature');

  if (!accountId || !feature) {
    return NextResponse.json(
      { error: 'accountId and feature are required' },
      { status: 400 }
    );
  }

  try {
    const status = await getAccountBillingStatus(accountId);
    
    if (!status) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check feature access using the guard function
    const guardResult = await requireFeature(accountId, feature);
    const hasAccess = guardResult.allowed;

    return NextResponse.json({
      hasAccess,
      currentPlan: status.plan,
      feature,
    });
  } catch (error: any) {
    console.error('Error checking feature access:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























































