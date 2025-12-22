/**
 * ForecastAI - Predicts revenue, cashflow, workload, lead volume, rep performance, weather risks, job delays
 */

import { createClient } from '@/lib/supabase/server'

interface ForecastResult {
  revenue: {
    next30Days: number
    next60Days: number
    next90Days: number
    trend: 'up' | 'down' | 'stable'
  }
  cashflow: {
    next30Days: number
    next60Days: number
    next90Days: number
    riskLevel: 'low' | 'medium' | 'high'
  }
  workload: {
    backlogDays: number
    capacityUtilization: number
    projectedCompletion: string
  }
  leads: {
    next30Days: number
    trend: 'up' | 'down' | 'stable'
  }
  risks: {
    weatherDelays: number
    materialDelays: number
    crewCapacity: 'ok' | 'stretched' | 'overloaded'
  }
}

/**
 * Generate forecasts for a workspace
 */
export async function generateForecast(workspaceId: string): Promise<ForecastResult> {
  const supabase = createClient()

  // Get historical jobs data
  const { data: jobs } = await supabase
    .from('roofing_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(200)

  // Get historical leads
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(200)

  // Get active jobs
  const activeJobs = jobs?.filter(j => 
    j.status === 'scheduled' || j.status === 'in_progress'
  ) || []

  // Calculate revenue forecast (simple trend-based)
  const last30DaysRevenue = calculateRevenueLastNDays(jobs || [], 30)
  const last60DaysRevenue = calculateRevenueLastNDays(jobs || [], 60)
  const avgDailyRevenue = last30DaysRevenue / 30

  // Revenue forecast
  const revenue30 = avgDailyRevenue * 30
  const revenue60 = avgDailyRevenue * 60
  const revenue90 = avgDailyRevenue * 90

  // Determine trend
  const recent30 = calculateRevenueLastNDays(jobs || [], 30)
  const previous30 = calculateRevenueLastNDays(jobs || [], 60) - recent30
  const trend = recent30 > previous30 ? 'up' : recent30 < previous30 ? 'down' : 'stable'

  // Cashflow forecast (simplified - assumes 50% deposit, 50% on completion)
  const scheduledJobsValue = activeJobs.reduce((sum, j) => sum + parseFloat(j.job_value || 0), 0)
  const estimatedDeposits = scheduledJobsValue * 0.5
  const estimatedCompletions = scheduledJobsValue * 0.5

  // Workload calculation
  const totalBacklogValue = activeJobs.reduce((sum, j) => sum + parseFloat(j.job_value || 0), 0)
  const avgJobValue = jobs?.length > 0 
    ? jobs.reduce((sum, j) => sum + parseFloat(j.job_value || 0), 0) / jobs.length 
    : 0
  const estimatedJobsInBacklog = avgJobValue > 0 ? totalBacklogValue / avgJobValue : 0
  const avgJobsPerMonth = last30DaysRevenue / (avgJobValue || 1)
  const backlogDays = avgJobsPerMonth > 0 ? (estimatedJobsInBacklog / avgJobsPerMonth) * 30 : 0

  // Lead forecast
  const last30DaysLeads = leads?.filter(l => {
    const created = new Date(l.created_at)
    const daysAgo = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
    return daysAgo <= 30
  }).length || 0

  const leadTrend = last30DaysLeads > 20 ? 'up' : last30DaysLeads < 10 ? 'down' : 'stable'

  // Risk assessment
  const crewCapacity = backlogDays > 60 ? 'overloaded' : backlogDays > 30 ? 'stretched' : 'ok'

  return {
    revenue: {
      next30Days: revenue30,
      next60Days: revenue60,
      next90Days: revenue90,
      trend,
    },
    cashflow: {
      next30Days: estimatedDeposits + (revenue30 * 0.3),
      next60Days: estimatedDeposits + (revenue60 * 0.5),
      next90Days: estimatedDeposits + (revenue90 * 0.7),
      riskLevel: estimatedDeposits < revenue30 * 0.3 ? 'high' : estimatedDeposits < revenue30 * 0.5 ? 'medium' : 'low',
    },
    workload: {
      backlogDays: Math.round(backlogDays),
      capacityUtilization: Math.min(100, (backlogDays / 30) * 100),
      projectedCompletion: new Date(Date.now() + backlogDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
    leads: {
      next30Days: last30DaysLeads,
      trend: leadTrend,
    },
    risks: {
      weatherDelays: 0, // TODO: Integrate weather API
      materialDelays: 0, // TODO: Check material delivery status
      crewCapacity,
    },
  }
}

function calculateRevenueLastNDays(jobs: any[], days: number): number {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  return jobs
    .filter(j => {
      const jobDate = new Date(j.created_at || j.scheduled_start_date || Date.now())
      return jobDate >= cutoffDate && j.status === 'completed'
    })
    .reduce((sum, j) => sum + parseFloat(j.job_value || 0), 0)
}

























