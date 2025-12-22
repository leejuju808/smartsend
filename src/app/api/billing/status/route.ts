/**
 * Block 9100 — Billing Status API
 * Returns current billing status for an account
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getAccountBillingStatus } from '@/lib/billing/guard';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  try {
    const status = await getAccountBillingStatus(accountId);
    
    if (!status) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      plan: status.plan,
      emailLimit: status.emailLimit,
      campaignLimit: status.campaignLimit,
      emailUsage: status.emailUsage,
      emailUsageResetAt: status.emailUsageResetAt,
      isLocked: status.isLocked,
      subscriptionStatus: status.subscriptionStatus,
      features: status.features,
    });
  } catch (error: any) {
    console.error('Error fetching billing status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
