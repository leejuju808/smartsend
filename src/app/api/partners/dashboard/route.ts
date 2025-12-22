/**
 * Block 23760 — SmartSend Agency Partner Program v1
 * 
 * API route for partner dashboard data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (partnerError || !partner) {
      return NextResponse.json(
        { error: 'Partner account not found' },
        { status: 404 }
      );
    }

    // Get dashboard summary
    const { data: dashboardSummary, error: summaryError } = await supabase
      .from('partner_dashboard_summary')
      .select('*')
      .eq('partner_id', partner.id)
      .single();

    if (summaryError) {
      console.error('Error fetching dashboard summary:', summaryError);
    }

    // Get recent referrals
    const { data: referrals, error: referralsError } = await supabase
      .from('partner_referrals')
      .select(`
        *,
        subscription:subscriptions(
          plan,
          status,
          current_period_end
        )
      `)
      .eq('partner_id', partner.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (referralsError) {
      console.error('Error fetching referrals:', referralsError);
    }

    // Get recent commissions
    const { data: commissions, error: commissionsError } = await supabase
      .from('partner_commissions')
      .select(`
        *,
        referral:partner_referrals(
          referred_user_id
        )
      `)
      .eq('partner_id', partner.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (commissionsError) {
      console.error('Error fetching commissions:', commissionsError);
    }

    // Get recent payouts
    const { data: payouts, error: payoutsError } = await supabase
      .from('partner_payouts')
      .select('*')
      .eq('partner_id', partner.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (payoutsError) {
      console.error('Error fetching payouts:', payoutsError);
    }

    // Get referral performance
    const { data: referralPerformance, error: performanceError } = await supabase
      .from('partner_referral_performance')
      .select('*')
      .eq('partner_id', partner.id)
      .order('referred_at', { ascending: false });

    if (performanceError) {
      console.error('Error fetching referral performance:', performanceError);
    }

    return NextResponse.json({
      partner: {
        id: partner.id,
        agencyName: partner.agency_name,
        contactName: partner.contact_name,
        contactEmail: partner.contact_email,
        referralCode: partner.referral_code,
        tier: partner.tier,
        commissionRate: partner.commission_rate,
        numberOfAccounts: partner.number_of_accounts,
        status: partner.status,
        stripeConnectAccountStatus: partner.stripe_connect_account_status,
        onboardingCompleted: partner.onboarding_completed,
        whiteLabelDomain: partner.white_label_domain,
      },
      summary: dashboardSummary || {
        active_referrals_count: 0,
        pending_commissions_cents: 0,
        paid_commissions_cents: 0,
        this_month_commissions_cents: 0,
      },
      referrals: referrals || [],
      commissions: commissions || [],
      payouts: payouts || [],
      referralPerformance: referralPerformance || [],
    });
  } catch (error: any) {
    console.error('Error fetching partner dashboard:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch partner dashboard' },
      { status: 500 }
    );
  }
}






































