/**
 * Block 23760 — SmartSend Agency Partner Program v1
 * 
 * API route for processing monthly partner payouts via Stripe Connect
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

// POST /api/partners/payouts/process
// Process monthly payouts for all partners (admin only, or cron job)
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Check if user is admin (optional - can also be called by cron)
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role !== 'admin') {
        return NextResponse.json(
          { error: 'Admin access required' },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const {
      periodYear = new Date().getFullYear(),
      periodMonth = new Date().getMonth() + 1,
      dryRun = false,
    } = body;

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
        { error: 'Failed to process commissions' },
        { status: 500 }
      );
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        message: 'Dry run completed. Commissions calculated but not paid.',
        results: commissionResults,
      });
    }

    // Process payouts for each partner
    const payoutResults = [];
    const errors = [];

    for (const result of commissionResults || []) {
      try {
        const partnerId = result.partner_id;

        // Get partner details
        const { data: partner, error: partnerError } = await supabase
          .from('partners')
          .select('id, stripe_connect_account_id, stripe_connect_account_status')
          .eq('id', partnerId)
          .single();

        if (partnerError || !partner) {
          errors.push({ partnerId, error: 'Partner not found' });
          continue;
        }

        // Check if Stripe Connect account is active
        if (!partner.stripe_connect_account_id || partner.stripe_connect_account_status !== 'active') {
          errors.push({
            partnerId,
            error: 'Stripe Connect account not active',
          });
          continue;
        }

        // Get all pending commissions for this partner for this period
        const { data: commissions, error: commissionsError } = await supabase
          .from('partner_commissions')
          .select('id, commission_amount_cents')
          .eq('partner_id', partnerId)
          .eq('period_year', periodYear)
          .eq('period_month', periodMonth)
          .eq('status', 'pending');

        if (commissionsError || !commissions || commissions.length === 0) {
          continue; // No commissions to pay
        }

        // Calculate total payout amount
        const totalCents = commissions.reduce(
          (sum, c) => sum + c.commission_amount_cents,
          0
        );

        if (totalCents < 100) {
          // Minimum payout threshold ($1.00)
          continue;
        }

        // Check if payout already exists
        const { data: existingPayout } = await supabase
          .from('partner_payouts')
          .select('id')
          .eq('partner_id', partnerId)
          .eq('payout_year', periodYear)
          .eq('payout_month', periodMonth)
          .maybeSingle();

        if (existingPayout) {
          continue; // Payout already processed
        }

        // Create payout record
        const { data: payout, error: payoutError } = await supabase
          .from('partner_payouts')
          .insert({
            partner_id: partnerId,
            payout_year: periodYear,
            payout_month: periodMonth,
            total_commission_cents: totalCents,
            commission_count: commissions.length,
            status: 'processing',
          })
          .select()
          .single();

        if (payoutError) {
          errors.push({ partnerId, error: 'Failed to create payout record' });
          continue;
        }

        // Create Stripe transfer
        try {
          const transfer = await stripe.transfers.create({
            amount: totalCents,
            currency: 'usd',
            destination: partner.stripe_connect_account_id,
            description: `SmartSend Partner Commission - ${periodYear}-${String(periodMonth).padStart(2, '0')}`,
            metadata: {
              partner_id: partnerId,
              payout_id: payout.id,
              period_year: periodYear.toString(),
              period_month: periodMonth.toString(),
              commission_count: commissions.length.toString(),
            },
          });

          // Update payout with transfer ID
          await supabase
            .from('partner_payouts')
            .update({
              stripe_transfer_id: transfer.id,
              stripe_transfer_status: 'paid',
              status: 'paid',
              paid_at: new Date().toISOString(),
              processed_at: new Date().toISOString(),
            })
            .eq('id', payout.id);

          // Update commissions to 'paid' status
          const commissionIds = commissions.map((c) => c.id);
          await supabase
            .from('partner_commissions')
            .update({
              status: 'paid',
              payout_id: payout.id,
              paid_at: new Date().toISOString(),
            })
            .in('id', commissionIds);

          payoutResults.push({
            partnerId,
            payoutId: payout.id,
            amountCents: totalCents,
            transferId: transfer.id,
            success: true,
          });
        } catch (stripeError: any) {
          console.error(`Stripe transfer error for partner ${partnerId}:`, stripeError);

          // Update payout status to failed
          await supabase
            .from('partner_payouts')
            .update({
              status: 'failed',
              stripe_transfer_status: 'failed',
              metadata: {
                error: stripeError.message,
              },
            })
            .eq('id', payout.id);

          errors.push({
            partnerId,
            error: `Stripe transfer failed: ${stripeError.message}`,
          });
        }
      } catch (error: any) {
        console.error(`Error processing payout for partner ${result.partner_id}:`, error);
        errors.push({
          partnerId: result.partner_id,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      period: { year: periodYear, month: periodMonth },
      payoutsProcessed: payoutResults.length,
      totalAmountCents: payoutResults.reduce((sum, r) => sum + r.amountCents, 0),
      results: payoutResults,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error processing partner payouts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process payouts' },
      { status: 500 }
    );
  }
}






































