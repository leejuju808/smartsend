/**
 * AUREV Protocol v5 - Civilization Phase Metrics
 * 
 * Track progress toward 2035 targets:
 * - 1 Billion participants
 * - 1 Trillion daily micro-decisions
 * - 0% net waste
 * - 5× human productivity
 * - 99.9% ethical compliance
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface GlobalKPI {
  id: string
  kpiName: string
  kpiCategory: 'scale' | 'performance' | 'efficiency' | 'governance' | 'environment'
  currentValue: number
  targetValue: number
  unit: string
  progressPercent: number
  trend?: 'increasing' | 'stable' | 'decreasing'
  measuredAt: Date
}

/**
 * Civilization Metrics Engine
 */
export class CivilizationMetrics {
  private supabase = getServerSupabase()
  
  /**
   * Update global KPI
   */
  async updateKPI(
    kpiName: string,
    currentValue: number,
    options: {
      targetValue?: number
      unit?: string
      metadata?: Record<string, any>
    } = {}
  ): Promise<GlobalKPI> {
    // Get existing target if not provided
    const { data: existing } = await this.supabase
      .from('aurev5_global_kpis')
      .select('target_value, unit, kpi_category')
      .eq('kpi_name', kpiName)
      .order('measured_at', { ascending: false })
      .limit(1)
      .single()
    
    const targetValue = options.targetValue || (existing?.target_value ? Number(existing.target_value) : 0)
    const unit = options.unit || existing?.unit || ''
    const category = existing?.kpi_category || 'performance'
    
    const progressPercent = targetValue > 0
      ? Math.min(100, (currentValue / targetValue) * 100)
      : 0
    
    const { data, error } = await this.supabase
      .from('aurev5_global_kpis')
      .insert({
        kpi_name: kpiName,
        kpi_category: category,
        current_value: currentValue,
        target_value: targetValue,
        unit,
        progress_percent: progressPercent,
        metadata: options.metadata || {},
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to update KPI: ${error.message}`)
    }
    
    return this.mapToKPI(data)
  }
  
  /**
   * Get latest KPI value
   */
  async getKPI(kpiName: string): Promise<GlobalKPI | null> {
    const { data, error } = await this.supabase
      .from('aurev5_global_kpis')
      .select('*')
      .eq('kpi_name', kpiName)
      .order('measured_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error || !data) {
      return null
    }
    
    return this.mapToKPI(data)
  }
  
  /**
   * Get all KPIs by category
   */
  async getKPIsByCategory(category?: GlobalKPI['kpiCategory']): Promise<GlobalKPI[]> {
    let query = this.supabase
      .from('aurev5_global_kpis')
      .select('*')
      .order('measured_at', { ascending: false })
    
    if (category) {
      query = query.eq('kpi_category', category)
    }
    
    // Get latest for each KPI name
    const { data, error } = await query
    
    if (error) {
      throw new Error(`Failed to fetch KPIs: ${error.message}`)
    }
    
    // Group by kpi_name and get latest
    const kpiMap = new Map<string, any>()
    for (const kpi of data || []) {
      const existing = kpiMap.get(kpi.kpi_name)
      if (!existing || new Date(kpi.measured_at) > new Date(existing.measured_at)) {
        kpiMap.set(kpi.kpi_name, kpi)
      }
    }
    
    return Array.from(kpiMap.values()).map(this.mapToKPI)
  }
  
  /**
   * Calculate and update civilization metrics
   */
  async calculateMetrics(): Promise<{
    globalNodes: number
    dailyDecisions: number
    wastePercent: number
    energyEfficiency: number
    productivityUplift: number
    ethicalCompliance: number
  }> {
    // Count active nodes
    const { count: nodeCount } = await this.supabase
      .from('aurev5_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
    
    // Count PoI actions in last 24 hours
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    
    const { count: decisionsCount } = await this.supabase
      .from('aurev5_poi_actions')
      .select('*', { count: 'exact', head: true })
      .gte('executed_at', yesterday.toISOString())
    
    // Calculate waste reduction (placeholder - would need actual waste metrics)
    const wastePercent = 0 // Would calculate from actual data
    
    // Calculate energy efficiency (placeholder)
    const energyEfficiency = 0 // Would calculate from orbital/quantum node metrics
    
    // Calculate productivity uplift (placeholder - would track human productivity metrics)
    const productivityUplift = 1.0 // Baseline
    
    // Calculate ethical compliance (from ethical feedback resolution rate)
    const { count: totalFeedback } = await this.supabase
      .from('aurev5_ethical_feedback')
      .select('*', { count: 'exact', head: true })
    
    const { count: resolvedFeedback } = await this.supabase
      .from('aurev5_ethical_feedback')
      .select('*', { count: 'exact', head: true })
      .eq('resolved', true)
    
    const ethicalCompliance = totalFeedback && totalFeedback > 0
      ? ((resolvedFeedback || 0) / totalFeedback) * 100
      : 100
    
    // Update KPIs
    await this.updateKPI('global_nodes', nodeCount || 0, {
      targetValue: 1000000000, // 1B
      unit: 'participants',
    })
    
    await this.updateKPI('daily_micro_decisions', decisionsCount || 0, {
      targetValue: 1000000000000, // 1T
      unit: 'decisions/day',
    })
    
    await this.updateKPI('net_waste_percent', wastePercent, {
      targetValue: 0,
      unit: 'percent',
    })
    
    await this.updateKPI('energy_efficiency_gain', energyEfficiency, {
      targetValue: 95,
      unit: 'percent',
    })
    
    await this.updateKPI('human_productivity_uplift', productivityUplift, {
      targetValue: 5,
      unit: 'multiplier',
    })
    
    await this.updateKPI('ethical_compliance_rate', ethicalCompliance, {
      targetValue: 99.9,
      unit: 'percent',
    })
    
    return {
      globalNodes: nodeCount || 0,
      dailyDecisions: decisionsCount || 0,
      wastePercent,
      energyEfficiency,
      productivityUplift,
      ethicalCompliance,
    }
  }
  
  /**
   * Get civilization dashboard data
   */
  async getDashboardData(): Promise<{
    kpis: GlobalKPI[]
    summary: {
      totalNodes: number
      activeNodes: number
      totalTokenSupply: number
      totalTransactions: number
      activeCompanions: number
      activeCouncils: number
      senateMembers: number
      activeProposals: number
    }
  }> {
    const kpis = await this.getKPIsByCategory()
    
    // Get summary stats
    const { count: totalNodes } = await this.supabase
      .from('aurev5_nodes')
      .select('*', { count: 'exact', head: true })
    
    const { count: activeNodes } = await this.supabase
      .from('aurev5_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
    
    // Sum token supply
    const { data: balances } = await this.supabase
      .from('aurev5_token_balances')
      .select('balance_micro')
    
    const totalTokenSupply = balances?.reduce((sum, b) => sum + Number(b.balance_micro || 0), 0) || 0
    
    const { count: totalTransactions } = await this.supabase
      .from('aurev5_token_transactions')
      .select('*', { count: 'exact', head: true })
    
    const { count: activeCompanions } = await this.supabase
      .from('aurev5_companions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
    
    const { count: activeCouncils } = await this.supabase
      .from('aurev5_councils')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
    
    const { count: senateMembers } = await this.supabase
      .from('aurev5_senate_members')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
    
    const { count: activeProposals } = await this.supabase
      .from('aurev5_senate_proposals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
    
    return {
      kpis,
      summary: {
        totalNodes: totalNodes || 0,
        activeNodes: activeNodes || 0,
        totalTokenSupply: totalTokenSupply / 1000000, // Convert to AUREV
        totalTransactions: totalTransactions || 0,
        activeCompanions: activeCompanions || 0,
        activeCouncils: activeCouncils || 0,
        senateMembers: senateMembers || 0,
        activeProposals: activeProposals || 0,
      },
    }
  }
  
  private mapToKPI(data: any): GlobalKPI {
    return {
      id: data.id,
      kpiName: data.kpi_name,
      kpiCategory: data.kpi_category,
      currentValue: Number(data.current_value || 0),
      targetValue: Number(data.target_value || 0),
      unit: data.unit || '',
      progressPercent: Number(data.progress_percent || 0),
      trend: data.trend,
      measuredAt: new Date(data.measured_at),
    }
  }
}

// Singleton instance
let metricsInstance: CivilizationMetrics | null = null

export function getCivilizationMetrics(): CivilizationMetrics {
  if (!metricsInstance) {
    metricsInstance = new CivilizationMetrics()
  }
  return metricsInstance
}

