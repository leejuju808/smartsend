import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

/**
 * GET /api/partners/portal/metrics
 * Get partner portal metrics (revenue, orgs, payouts)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Find partner by portal_user_id
    const { data: partner, error: partnerError } = await adminClient
      .from('regional_partners')
      .select('*')
      .eq('portal_user_id', user.id)
      .maybeSingle();

    if (partnerError || !partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // Get partner's orgs
    const { data: orgs } = await adminClient
      .from('orgs')
      .select('id, name')
      .eq('partner_id', partner.id);

    const orgIds = orgs?.map((o) => o.id) || [];

    // Calculate revenue
    const { data: revenueData } = await adminClient
      .from('partner_revenue')
      .select('gross_revenue_usd, partner_share_usd, payout_status')
      .eq('partner_id', partner.id);

    const totalRevenue = revenueData?.reduce((sum, r) => sum + Number(r.gross_revenue_usd || 0), 0) || 0;
    const totalShare = revenueData?.reduce((sum, r) => sum + Number(r.partner_share_usd || 0), 0) || 0;
    const pendingPayouts = revenueData?.filter((r) => r.payout_status === 'pending').length || 0;

    // Get active contracts from partner's orgs
    const { data: contracts } = await adminClient
      .from('enterprise_contracts')
      .select('monthly_price_usd, status')
      .in('org_id', orgIds)
      .eq('status', 'active');

    const mrr = contracts?.reduce((sum, c) => sum + Number(c.monthly_price_usd || 0), 0) || 0;

    return NextResponse.json({
      partner: {
        id: partner.id,
        name: partner.partner_name,
        region: partner.region,
      },
      metrics: {
        active_orgs: partner.active_orgs_count || 0,
        total_orgs: orgs?.length || 0,
        total_revenue_usd: totalRevenue,
        partner_share_usd: totalShare,
        monthly_mrr_usd: mrr,
        pending_payouts: pendingPayouts,
        revenue_share_percent: partner.revenue_share_percent,
        minimum_orgs_required: partner.minimum_orgs_required,
        certification_level: partner.certification_level,
      },
      orgs: orgs?.map((o) => ({ id: o.id, name: o.name })) || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

