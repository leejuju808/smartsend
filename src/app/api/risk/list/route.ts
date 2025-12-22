import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { RiskRadar } from '@/lib/risk';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get workspace ID from query params
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');
    const riskLevel = searchParams.get('risk_level'); // Optional filter
    
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
    }

    // Verify user is member of workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    // Get risk data
    const riskRadar = new RiskRadar(workspaceId);
    
    let domains;
    if (riskLevel && ['normal', 'watch', 'high'].includes(riskLevel)) {
      domains = await riskRadar.getDomainsByRiskLevel(riskLevel as 'normal' | 'watch' | 'high');
    } else {
      domains = await riskRadar.getAllDomainRisks();
    }

    // Get risk metrics
    const metrics = await riskRadar.getRiskMetrics();
    
    // Get attention domains (watch + high risk)
    const attentionDomains = await riskRadar.getAttentionDomains();

    return NextResponse.json({
      domains,
      metrics,
      attention_domains: attentionDomains
    });

  } catch (error) {
    console.error('Error listing domain risks:', error);
    return NextResponse.json(
      { error: 'Failed to list domain risks' },
      { status: 500 }
    );
  }
} 