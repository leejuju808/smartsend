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
    const { workspace_id, domain } = body;

    if (!workspace_id) {
      return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
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

    const riskRadar = new RiskRadar(workspace_id);

    if (domain) {
      // Recompute risk for specific domain
      const newRiskLevel = await riskRadar.recomputeDomainRisk(domain);
      
      return NextResponse.json({
        success: true,
        message: `Domain ${domain} risk recomputed to ${newRiskLevel}`,
        domain,
        risk_level: newRiskLevel
      });
    } else {
      // Bulk recompute all domains
      const result = await riskRadar.recomputeAllDomainRisks();
      
      return NextResponse.json({
        success: true,
        message: `Bulk risk recomputation completed`,
        result
      });
    }

  } catch (error) {
    console.error('Error recomputing domain risk:', error);
    return NextResponse.json(
      { error: 'Failed to recompute domain risk' },
      { status: 500 }
    );
  }
} 