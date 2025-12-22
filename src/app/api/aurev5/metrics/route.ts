/**
 * AUREV Protocol v5 - Metrics API
 * 
 * Get civilization phase metrics and KPIs
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCivilizationMetrics } from '@/lib/aurev5/metrics'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'dashboard'
    
    const metrics = getCivilizationMetrics()
    
    if (action === 'dashboard') {
      const dashboardData = await metrics.getDashboardData()
      return NextResponse.json(dashboardData)
    }
    
    if (action === 'calculate') {
      const calculatedMetrics = await metrics.calculateMetrics()
      return NextResponse.json({ metrics: calculatedMetrics })
    }
    
    if (action === 'kpis') {
      const category = searchParams.get('category') as any
      const kpis = await metrics.getKPIsByCategory(category)
      return NextResponse.json({ kpis })
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use "dashboard", "calculate", or "kpis"' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Error in metrics API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}

