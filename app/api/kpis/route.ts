/**
 * Block 24820 — SmartSend Roofing KPI Reporting API
 * Returns all KPI data for the reporting dashboard
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user and workspace
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's workspace
    const { data: workspaceData, error: workspaceError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (workspaceError || !workspaceData) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const workspaceId = workspaceData.workspace_id

    // Fetch all KPI data in parallel
    const [
      leadFunnelData,
      revenueData,
      forecastData,
      crewData,
      supplierData,
      insuranceData,
      neighborhoodData,
      ownerSnapshotData,
      insightsData
    ] = await Promise.all([
      // Lead → Close Funnel
      supabase
        .from('lead_close_funnel')
        .select('*')
        .eq('workspace_id', workspaceId)
        .single(),
      
      // Revenue Summary
      supabase
        .from('revenue_summary')
        .select('*')
        .eq('workspace_id', workspaceId)
        .single(),
      
      // Forecasting
      supabase.rpc('forecast_revenue', { 
        p_workspace_id: workspaceId,
        p_days_ahead: 30
      }),
      
      // Crew Metrics
      supabase
        .from('crew_metrics')
        .select('*')
        .eq('workspace_id', workspaceId),
      
      // Supplier Metrics
      supabase
        .from('supplier_metrics')
        .select('*')
        .eq('workspace_id', workspaceId),
      
      // Insurance KPIs
      supabase
        .from('insurance_kpis')
        .select('*')
        .eq('workspace_id', workspaceId)
        .single(),
      
      // Neighborhood Performance
      supabase
        .from('neighborhood_performance')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('total_revenue', { ascending: false })
        .limit(10),
      
      // Owner KPI Snapshot
      supabase.rpc('owner_kpi_snapshot', { 
        p_workspace_id: workspaceId
      }),
      
      // AI Insights
      supabase.rpc('generate_ai_insights', { 
        p_workspace_id: workspaceId
      })
    ])

    return NextResponse.json({
      leadFunnel: leadFunnelData.data || null,
      revenue: revenueData.data || null,
      forecast: forecastData.data || null,
      crews: crewData.data || [],
      suppliers: supplierData.data || [],
      insurance: insuranceData.data || null,
      neighborhoods: neighborhoodData.data || [],
      ownerSnapshot: ownerSnapshotData.data || null,
      insights: insightsData.data || null
    })
  } catch (error) {
    console.error('Error fetching KPI data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch KPI data' },
      { status: 500 }
    )
  }
}






































