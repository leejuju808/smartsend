/**
 * Block 23760 — SmartSend Agency Partner Program v1
 * 
 * API route for agency partner registration
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      agencyName,
      contactName,
      contactEmail,
      contactPhone,
    } = body;

    // Validate required fields
    if (!agencyName || !contactName || !contactEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: agencyName, contactName, contactEmail' },
        { status: 400 }
      );
    }

    // Check if user already has a partner account
    const { data: existingPartner } = await supabase
      .from('partners')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingPartner) {
      return NextResponse.json(
        { error: 'Partner account already exists for this user' },
        { status: 400 }
      );
    }

    // Generate unique referral code
    const { data: referralCodeData } = await supabase.rpc('generate_partner_referral_code');
    const referralCode = referralCodeData || `AGENCY-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create partner record
    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .insert({
        agency_name: agencyName,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        user_id: user.id,
        referral_code: referralCode,
        tier: 'partner',
        commission_rate: 20.00,
        status: 'pending',
        onboarding_completed: false,
      })
      .select()
      .single();

    if (partnerError) {
      console.error('Error creating partner:', partnerError);
      return NextResponse.json(
        { error: 'Failed to create partner account' },
        { status: 500 }
      );
    }

    // Create Stripe Connect account for payouts (Express account)
    try {
      const connectAccount = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: contactEmail,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          partner_id: partner.id,
          agency_name: agencyName,
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

      // Create onboarding link
      const onboardingLink = await stripe.accountLinks.create({
        account: connectAccount.id,
        refresh_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/partners/onboarding/refresh`,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/partners/dashboard`,
        type: 'account_onboarding',
      });

      return NextResponse.json({
        partner: {
          id: partner.id,
          agencyName: partner.agency_name,
          referralCode: partner.referral_code,
          tier: partner.tier,
          commissionRate: partner.commission_rate,
          status: partner.status,
        },
        onboardingLink: onboardingLink.url,
        message: 'Partner account created successfully. Please complete Stripe Connect onboarding to receive payouts.',
      });
    } catch (stripeError: any) {
      console.error('Error creating Stripe Connect account:', stripeError);
      // Partner created but Stripe Connect failed - they can retry later
      return NextResponse.json({
        partner: {
          id: partner.id,
          agencyName: partner.agency_name,
          referralCode: partner.referral_code,
          tier: partner.tier,
          commissionRate: partner.commission_rate,
          status: partner.status,
        },
        warning: 'Partner account created but Stripe Connect setup failed. You can complete this later.',
      });
    }
  } catch (error: any) {
    console.error('Error in partner registration:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to register partner' },
      { status: 500 }
    );
  }
}






































