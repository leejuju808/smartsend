/**
 * Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
 * 
 * API endpoints for capacity forecasting
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateCapacityForecast } from '@/lib/scheduling-intelligence';

/**
 * GET /api/scheduling/capacity
 * Get capacity forecast for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspace_id');
    const startDate = searchParams.get('start_date') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('end_date') || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    const forecasts = await calculateCapacityForecast(workspaceId, startDate, endDate);

    // Calculate summary
    const summary = {
      totalDays: forecasts.length,
      underCapacity: forecasts.filter(f => f.workloadStatus === 'under_capacity').length,
      balanced: forecasts.filter(f => f.workloadStatus === 'balanced').length,
      overloaded: forecasts.filter(f => f.workloadStatus === 'overloaded').length,
      criticalOverload: forecasts.filter(f => f.workloadStatus === 'critical_overload').length,
      averageUtilization: forecasts.length > 0
        ? forecasts.reduce((sum, f) => sum + f.utilizationPercentage, 0) / forecasts.length
        : 0,
    };

    return NextResponse.json({
      forecasts,
      summary,
    });
  } catch (error) {
    console.error('Error fetching capacity forecast:', error);
    return NextResponse.json(
      { error: 'Failed to fetch capacity forecast' },
      { status: 500 }
    );
  }
}





















