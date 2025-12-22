import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { RiskRadar } from '@/lib/risk';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { workspace_id, domain, risk_level, reason } = body;

    // Validate required fields
    if (!workspace_id || !domain || !risk_level || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: workspace_id, domain, risk_level, reason' },
        { status: 400 }
      );
    }

    // Validate risk level
    if (!['normal', 'watch', 'high'].includes(risk_level)) {
      return NextResponse.json(
        { error: 'Invalid risk level. Must be normal, watch, or high' },
        { status: 400 }
      );
    }

    // Verify user is member of workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    // Override domain risk
    const riskRadar = new RiskRadar(workspace_id);
    const success = await riskRadar.overrideDomainRisk(domain, risk_level, reason);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to override domain risk' },
        { status: 500 }
      );
    }

    // Get updated risk data
    const updatedRisk = await riskRadar.getDomainRisk(domain);

    return NextResponse.json({
      success: true,
      message: `Domain ${domain} risk level overridden to ${risk_level}`,
      domain,
      risk_level: updatedRisk,
      reason
    });

  } catch (error) {
    console.error('Error overriding domain risk:', error);
    return NextResponse.json(
      { error: 'Failed to override domain risk' },
      { status: 500 }
    );
  }
} 