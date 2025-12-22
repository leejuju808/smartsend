import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { minPayoutThreshold = 2000 } = await req.json(); // Default $20.00

    // Get creators with accrued payouts
    const { data: creators, error: creatorsError } = await supabase
      .from('marketplace_creators')
      .select(`
        id,
        stripe_account_id,
        rev_share_bps
      `)
      .eq('status', 'approved')
      .not('stripe_account_id', 'is', null);

    if (creatorsError) throw creatorsError;

    const payoutReport = [];
    let totalProcessed = 0;
    let totalAmount = 0;

    for (const creator of creators || []) {
      // Get accrued payouts for this creator
      const { data: accruedPayouts, error: payoutError } = await supabase
        .from('marketplace_payout_ledger')
        .select('id, amount_cents')
        .eq('creator_id', creator.id)
        .eq('status', 'accrued');

      if (payoutError) continue;

      if (!accruedPayouts || accruedPayouts.length === 0) continue;

      const totalAccrued = accruedPayouts.reduce((sum, p) => sum + p.amount_cents, 0);

      if (totalAccrued < minPayoutThreshold) continue;

      try {
        // Create transfer to creator's Stripe account
        const transfer = await stripe.transfers.create({
          amount: totalAccrued,
          currency: 'usd',
          destination: creator.stripe_account_id!,
          description: `Creator payout for ${accruedPayouts.length} transactions`,
        });

        // Mark payouts as queued
        const payoutIds = accruedPayouts.map(p => p.id);
        await supabase
          .from('marketplace_payout_ledger')
          .update({ 
            status: 'queued',
            updated_at: new Date().toISOString()
          })
          .in('id', payoutIds);

        // If transfer succeeds, mark as paid
        if (transfer.object === 'transfer') {
          await supabase
            .from('marketplace_payout_ledger')
            .update({ 
              status: 'paid',
              updated_at: new Date().toISOString()
            })
            .in('id', payoutIds);

          payoutReport.push({
            creatorId: creator.id,
            count: accruedPayouts.length,
            amount: totalAccrued,
            result: 'success',
            transferId: transfer.id,
          });
        } else {
          // Mark as failed if transfer doesn't succeed immediately
          await supabase
            .from('marketplace_payout_ledger')
            .update({ 
              status: 'failed',
              updated_at: new Date().toISOString()
            })
            .in('id', payoutIds);

          payoutReport.push({
            creatorId: creator.id,
            count: accruedPayouts.length,
            amount: totalAccrued,
            result: 'failed',
            transferId: transfer.id,
          });
        }

        totalProcessed += accruedPayouts.length;
        totalAmount += totalAccrued;

      } catch (stripeError) {
        console.error(`Stripe transfer failed for creator ${creator.id}:`, stripeError);
        
        // Mark as failed
        const payoutIds = accruedPayouts.map(p => p.id);
        await supabase
          .from('marketplace_payout_ledger')
          .update({ 
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .in('id', payoutIds);

        payoutReport.push({
          creatorId: creator.id,
          count: accruedPayouts.length,
          amount: totalAccrued,
          result: 'failed',
          error: stripeError instanceof Error ? stripeError.message : 'Unknown error',
        });
      }
    }

    // Emit analytics event
    console.log('payout_run', { 
      adminId: user.id, 
      totalProcessed, 
      totalAmount,
      creatorCount: creators?.length || 0 
    });

    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed,
        totalAmount,
        creatorCount: creators?.length || 0,
      },
      payouts: payoutReport,
    });

  } catch (error) {
    console.error('Payout job error:', error);
    return NextResponse.json(
      { error: 'Failed to run payout job' },
      { status: 500 }
    );
  }
} 