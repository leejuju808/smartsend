import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';

/**
 * GET /api/ai-advisor
 * Fetch AI Advisor insights, recommendations, and alerts for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    let workspaceId = searchParams.get('workspace_id');
    const refresh = searchParams.get('refresh') === 'true';

    // Get workspace_id from cookie if not provided
    if (!workspaceId) {
      workspaceId = await getCurrentWorkspaceId();
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspace_id is required' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // If refresh requested, trigger insight generation
    if (refresh) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      
      await fetch(`${supabaseUrl}/functions/v1/ai-advisor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ workspace_id: workspaceId, force_refresh: true }),
      });
    }

    // Fetch insights
    const { data: insights, error: insightsError } = await supabase
      .from('ai_advisor_insights')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (insightsError) {
      console.error('Error fetching insights:', insightsError);
    }

    // Fetch recommendations (Next Best Actions)
    const { data: recommendations, error: recError } = await supabase
      .from('ai_advisor_recommendations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (recError) {
      console.error('Error fetching recommendations:', recError);
    }

    // Fetch active alerts
    const { data: alerts, error: alertsError } = await supabase
      .from('ai_advisor_alerts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (alertsError) {
      console.error('Error fetching alerts:', alertsError);
    }

    // Fetch latest audit
    const { data: latestAudit, error: auditError } = await supabase
      .from('ai_advisor_audits')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('audit_date', { ascending: false })
      .limit(1)
      .single();

    if (auditError && auditError.code !== 'PGRST116') {
      console.error('Error fetching audit:', auditError);
    }

    // Aggregate summary data
    const summary = {
      insights: {
        total: insights?.length || 0,
        by_category: groupBy(insights || [], 'category'),
        by_priority: groupBy(insights || [], 'priority'),
      },
      recommendations: {
        total: recommendations?.length || 0,
        high_priority: recommendations?.filter((r: any) => r.priority_score >= 70).length || 0,
      },
      alerts: {
        total: alerts?.length || 0,
        critical: alerts?.filter((a: any) => a.severity === 'critical').length || 0,
        warnings: alerts?.filter((a: any) => a.severity === 'warning').length || 0,
      },
    };

    return NextResponse.json({
      insights: insights || [],
      recommendations: recommendations || [],
      alerts: alerts || [],
      latest_audit: latestAudit || null,
      summary,
    });
  } catch (error: any) {
    console.error('Error in AI Advisor API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-advisor
 * Apply a recommendation or acknowledge an alert
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, entity_type, entity_id, workspace_id } = body;

    if (!action || !entity_type || !entity_id || !workspace_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    if (action === 'apply_recommendation') {
      const { error } = await supabase.rpc('apply_ai_recommendation', {
        p_recommendation_id: entity_id,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'acknowledge_alert') {
      const { error } = await supabase
        .from('ai_advisor_alerts')
        .update({
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', entity_id)
        .eq('workspace_id', workspace_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'acknowledge_insight') {
      const { error } = await supabase.rpc('acknowledge_ai_insight', {
        p_insight_id: entity_id,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error in AI Advisor POST:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function groupBy<T>(array: T[], key: keyof T): Record<string, number> {
  return array.reduce((result, item) => {
    const group = String(item[key] || 'unknown');
    result[group] = (result[group] || 0) + 1;
    return result;
  }, {} as Record<string, number>);
}

