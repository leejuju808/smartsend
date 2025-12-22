/**
 * Block 23760 — SmartSend Agency Partner Program v1
 * 
 * API route for handling partner referrals
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/partners/referral?code=AGENCY-XXX
// Get referral information
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const searchParams = req.nextUrl.searchParams;
    const referralCode = searchParams.get('code');

    if (!referralCode) {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400 }
      );
    }

    // Get partner by referral code
    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('id, agency_name, tier, status')
      .eq('referral_code', referralCode)
      .eq('status', 'active')
      .maybeSingle();

    if (partnerError || !partner) {
      return NextResponse.json(
        { error: 'Invalid or inactive referral code' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      valid: true,
      partner: {
        agencyName: partner.agency_name,
        tier: partner.tier,
      },
    });
  } catch (error: any) {
    console.error('Error validating referral code:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to validate referral code' },
      { status: 500 }
    );
  }
}

// POST /api/partners/referral
// Create a referral when a user signs up with a partner code
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { referralCode, referralSource = 'link' } = body;

    if (!referralCode) {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400 }
      );
    }

    // Get partner by referral code
    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('id, status')
      .eq('referral_code', referralCode)
      .eq('status', 'active')
      .maybeSingle();

    if (partnerError || !partner) {
      return NextResponse.json(
        { error: 'Invalid or inactive referral code' },
        { status: 404 }
      );
    }

    // Check if user already has a referral
    const { data: existingReferral } = await supabase
      .from('partner_referrals')
      .select('id')
      .eq('referred_user_id', user.id)
      .maybeSingle();

    if (existingReferral) {
      return NextResponse.json(
        { error: 'User already has a referral' },
        { status: 400 }
      );
    }

    // Create referral record
    const { data: referral, error: referralError } = await supabase
      .from('partner_referrals')
      .insert({
        partner_id: partner.id,
        referred_user_id: user.id,
        referral_code: referralCode,
        referral_source: referralSource,
        status: 'pending',
      })
      .select()
      .single();

    if (referralError) {
      console.error('Error creating referral:', referralError);
      return NextResponse.json(
        { error: 'Failed to create referral' },
        { status: 500 }
      );
    }

    // Update subscription with partner_id if subscription exists
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (subscription) {
      await supabase
        .from('subscriptions')
        .update({
          partner_id: partner.id,
          partner_referral_code: referralCode,
        })
        .eq('id', subscription.id);
    }

    return NextResponse.json({
      success: true,
      referral: {
        id: referral.id,
        partnerId: referral.partner_id,
        referralCode: referral.referral_code,
        status: referral.status,
      },
      message: 'Referral created successfully. Commission will be calculated when subscription becomes active.',
    });
  } catch (error: any) {
    console.error('Error creating referral:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create referral' },
      { status: 500 }
    );
  }
}






































