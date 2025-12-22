/**
 * Block 23760 — SmartSend Agency Partner Program v1
 * 
 * Cron job endpoint for processing monthly partner commissions
 * Should be called monthly (e.g., via Vercel Cron or Supabase Cron)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret (if using Vercel Cron)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current period (previous month for commissions)
    const now = new Date();
    const periodYear = now.getFullYear();
    const periodMonth = now.getMonth() + 1; // Current month

    // Process commissions for all partners
    const { data: commissionResults, error: commissionError } = await supabase.rpc(
      'process_monthly_partner_commissions',
      {
        p_period_year: periodYear,
        p_period_month: periodMonth,
      }
    );

    if (commissionError) {
      console.error('Error processing commissions:', commissionError);
      return NextResponse.json(
        { error: 'Failed to process commissions', details: commissionError },
        { status: 500 }
      );
    }

    // Call payout processing endpoint
    const payoutUrl = new URL('/api/partners/payouts/process', req.nextUrl.origin);
    const payoutResponse = await fetch(payoutUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Pass service role key for internal call
        'x-service-role': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      },
      body: JSON.stringify({
        periodYear,
        periodMonth,
        dryRun: false,
      }),
    });

    const payoutResult = await payoutResponse.json();

    return NextResponse.json({
      success: true,
      period: { year: periodYear, month: periodMonth },
      commissionsProcessed: commissionResults?.length || 0,
      payouts: payoutResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in partner commissions cron:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process partner commissions' },
      { status: 500 }
    );
  }
}






































