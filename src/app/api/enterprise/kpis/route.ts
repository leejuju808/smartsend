import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

/**
 * GET /api/enterprise/kpis
 * Get enterprise expansion KPIs
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    const supabase = createAdminClient();

    // Get latest KPI record
    let query = supabase.from('enterprise_kpis').select('*').order('date', { ascending: false }).limit(1);

    if (year && month) {
      query = supabase
        .from('enterprise_kpis')
        .select('*')
        .eq('year', parseInt(year))
        .eq('month', parseInt(month))
        .single();
    }

    const { data: kpiRecord, error: kpiError } = await query;

    // Also get real-time counts
    const { count: activeOrgsCount } = await supabase
      .from('orgs')
      .select('*', { count: 'exact', head: true })
      .not('partner_id', 'is', null);

    const { count: enterpriseClientsCount } = await supabase
      .from('enterprise_contracts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('tier', 'enterprise');

    const { count: regionalPartnersCount } = await supabase
      .from('regional_partners')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Calculate MRR
    const { data: activeContracts } = await supabase
      .from('enterprise_contracts')
      .select('monthly_price_usd')
      .eq('status', 'active');

    const mrr = activeContracts?.reduce((sum, c) => sum + Number(c.monthly_price_usd || 0), 0) || 0;

    // Calculate average contract value
    const avgContractValue =
      activeContracts && activeContracts.length > 0
        ? mrr / activeContracts.length
        : 0;

    return NextResponse.json({
      kpis: kpiRecord || {
        active_orgs_count: activeOrgsCount || 0,
        enterprise_clients_count: enterpriseClientsCount || 0,
        regional_partners_count: regionalPartnersCount || 0,
        monthly_mrr_usd: mrr,
        avg_contract_value_usd: avgContractValue,
      },
      targets: {
        active_orgs_target: 1000,
        enterprise_clients_target: 20,
        regional_partners_target: 5,
        monthly_mrr_target_usd: 250000,
        avg_contract_value_target_usd: 10000,
      },
      progress: {
        active_orgs_percent: ((activeOrgsCount || 0) / 1000) * 100,
        enterprise_clients_percent: ((enterpriseClientsCount || 0) / 20) * 100,
        regional_partners_percent: ((regionalPartnersCount || 0) / 5) * 100,
        mrr_percent: (mrr / 250000) * 100,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

