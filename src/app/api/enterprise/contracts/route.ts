import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { getActiveOrg } from '@/lib/org';

/**
 * GET /api/enterprise/contracts
 * Get enterprise contracts for the current org
 */
export async function GET(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: 'No active organization' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: contract, error } = await supabase
      .from('enterprise_contracts')
      .select('*')
      .eq('org_id', org.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ contract });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/enterprise/contracts
 * Create or update enterprise contract (admin only)
 */
export async function POST(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: 'No active organization' }, { status: 401 });
    }

    const body = await req.json();
    const {
      tier,
      deployment_type,
      monthly_price_usd,
      annual_price_usd,
      contract_start_date,
      contract_end_date,
      support_level,
      max_users,
      max_seats,
      max_emails_per_month,
      max_workflows,
      max_agents,
      stripe_subscription_id,
      metadata,
    } = body;

    const supabase = createAdminClient();

    // Generate contract number
    const contractNumber = `ENT-${org.id.toString().slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // Upsert contract
    const { data: contract, error } = await supabase
      .from('enterprise_contracts')
      .upsert(
        {
          org_id: org.id,
          contract_number: contractNumber,
          tier,
          deployment_type,
          monthly_price_usd,
          annual_price_usd,
          contract_start_date,
          contract_end_date,
          support_level,
          max_users,
          max_seats,
          max_emails_per_month,
          max_workflows,
          max_agents,
          stripe_subscription_id,
          status: 'active',
          metadata: metadata || {},
        },
        {
          onConflict: 'org_id',
        }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

