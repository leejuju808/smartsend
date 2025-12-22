/**
 * Block 23760 — SmartSend Agency Partner Program v1
 * 
 * API route for Stripe Connect account onboarding
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

// GET /api/partners/connect/onboarding
// Get Stripe Connect onboarding link for partner
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get partner record
    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('id, stripe_connect_account_id, stripe_connect_account_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (partnerError || !partner) {
      return NextResponse.json(
        { error: 'Partner account not found' },
        { status: 404 }
      );
    }

    // If no Stripe Connect account, create one
    if (!partner.stripe_connect_account_id) {
      try {
        const connectAccount = await stripe.accounts.create({
          type: 'express',
          country: 'US',
          email: partner.contact_email,
          capabilities: {
            transfers: { requested: true },
          },
          metadata: {
            partner_id: partner.id,
            agency_name: partner.agency_name,
          },
        });

        // Update partner with Stripe Connect account ID
        await supabase
          .from('partners')
          .update({
            stripe_connect_account_id: connectAccount.id,
            stripe_connect_account_status: 'pending',
          })
          .eq('id', partner.id);

        partner.stripe_connect_account_id = connectAccount.id;
        partner.stripe_connect_account_status = 'pending';
      } catch (stripeError: any) {
        console.error('Error creating Stripe Connect account:', stripeError);
        return NextResponse.json(
          { error: 'Failed to create Stripe Connect account' },
          { status: 500 }
        );
      }
    }

    // Create onboarding link
    const onboardingLink = await stripe.accountLinks.create({
      account: partner.stripe_connect_account_id!,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/partners/onboarding/refresh`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/partners/dashboard`,
      type: 'account_onboarding',
    });

    return NextResponse.json({
      onboardingUrl: onboardingLink.url,
      accountStatus: partner.stripe_connect_account_status,
    });
  } catch (error: any) {
    console.error('Error creating onboarding link:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create onboarding link' },
      { status: 500 }
    );
  }
}

// POST /api/partners/connect/onboarding
// Webhook handler for Stripe Connect account updates
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, status } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Update partner Stripe Connect account status
    const { error: updateError } = await supabase
      .from('partners')
      .update({
        stripe_connect_account_status: status || 'active',
      })
      .eq('stripe_connect_account_id', accountId);

    if (updateError) {
      console.error('Error updating partner Stripe Connect status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update partner status' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error handling Stripe Connect webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to handle webhook' },
      { status: 500 }
    );
  }
}






































