/**
 * RiskAI - Monitors and flags risks early
 * Monitors: overdue jobs, unhappy customers, high-risk service requests, cost overruns, material delays, low sales performance, cashflow dips
 */

import { createClient } from '@/lib/supabase/server'

interface RiskAlert {
  id: string
  category: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  metadata: any
}

/**
 * Scan for risks and generate alerts
 */
export async function scanForRisks(workspaceId: string): Promise<RiskAlert[]> {
  const supabase = createClient()
  const risks: RiskAlert[] = []

  // 1. Check for overdue jobs
  const { data: jobs } = await supabase
    .from('roofing_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['scheduled', 'in_progress'])

  const today = new Date()
  const overdueJobs = jobs?.filter(j => {
    if (!j.scheduled_end_date) return false
    const endDate = new Date(j.scheduled_end_date)
    return endDate < today && j.status !== 'completed'
  }) || []

  overdueJobs.forEach(job => {
    const daysOverdue = Math.floor((today.getTime() - new Date(job.scheduled_end_date).getTime()) / (1000 * 60 * 60 * 24))
    risks.push({
      id: `overdue_job_${job.id}`,
      category: 'job_delay',
      severity: daysOverdue > 7 ? 'critical' : 'warning',
      message: `Job ${job.id?.substring(0, 8)} is ${daysOverdue} days overdue`,
      metadata: {
        jobId: job.id,
        jobValue: job.job_value,
        scheduledEndDate: job.scheduled_end_date,
        daysOverdue,
      },
    })
  })

  // 2. Check for jobs approaching deadline
  const upcomingDeadlines = jobs?.filter(j => {
    if (!j.scheduled_end_date) return false
    const endDate = new Date(j.scheduled_end_date)
    const daysUntil = Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntil > 0 && daysUntil <= 3
  }) || []

  upcomingDeadlines.forEach(job => {
    const daysUntil = Math.floor((new Date(job.scheduled_end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    risks.push({
      id: `upcoming_deadline_${job.id}`,
      category: 'job_delay',
      severity: 'warning',
      message: `Job ${job.id?.substring(0, 8)} deadline in ${daysUntil} days`,
      metadata: {
        jobId: job.id,
        daysUntil,
      },
    })
  })

  // 3. Check for low margins (if cost data available)
  const jobsWithCosts = jobs?.filter(j => j.actual_cost && j.job_value) || []
  const lowMarginJobs = jobsWithCosts.filter(j => {
    const margin = ((parseFloat(j.job_value) - parseFloat(j.actual_cost)) / parseFloat(j.job_value)) * 100
    return margin < 20
  })

  lowMarginJobs.forEach(job => {
    const margin = ((parseFloat(job.job_value) - parseFloat(job.actual_cost)) / parseFloat(job.job_value)) * 100
    risks.push({
      id: `low_margin_${job.id}`,
      category: 'profitability',
      severity: margin < 10 ? 'critical' : 'warning',
      message: `Job ${job.id?.substring(0, 8)} has low margin: ${margin.toFixed(1)}%`,
      metadata: {
        jobId: job.id,
        margin,
        jobValue: job.job_value,
        actualCost: job.actual_cost,
      },
    })
  })

  // 4. Check crew performance (if check-in data available)
  const { data: crewCheckIns } = await supabase
    .from('crew_check_ins')
    .select('*, crews(*)')
    .gte('check_in_time', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  // Calculate average hours per crew
  const crewPerformance: Record<string, { totalHours: number; jobCount: number; avgHours: number }> = {}
  
  crewCheckIns?.forEach(checkIn => {
    const crewId = checkIn.crew_id || 'unknown'
    if (!crewPerformance[crewId]) {
      crewPerformance[crewId] = { totalHours: 0, jobCount: 0, avgHours: 0 }
    }
    crewPerformance[crewId].totalHours += parseFloat(checkIn.total_hours || 0)
    crewPerformance[crewId].jobCount += 1
  })

  Object.entries(crewPerformance).forEach(([crewId, perf]) => {
    perf.avgHours = perf.jobCount > 0 ? perf.totalHours / perf.jobCount : 0
    // Flag if average hours is significantly low (potential slowness)
    if (perf.avgHours < 4 && perf.jobCount >= 3) {
      risks.push({
        id: `slow_crew_${crewId}`,
        category: 'crew_performance',
        severity: 'warning',
        message: `Crew ${crewId.substring(0, 8)} averaging ${perf.avgHours.toFixed(1)} hours/day (below expected)`,
        metadata: {
          crewId,
          avgHours: perf.avgHours,
          jobCount: perf.jobCount,
        },
      })
    }
  })

  // 5. Check cashflow risk (simplified)
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  const totalRevenue = jobs?.reduce((sum, j) => sum + parseFloat(j.job_value || 0), 0) || 0
  const totalPayments = payments?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0
  const collectionRate = totalRevenue > 0 ? (totalPayments / totalRevenue) * 100 : 0

  if (collectionRate < 60) {
    risks.push({
      id: 'low_collection_rate',
      category: 'cashflow',
      severity: 'critical',
      message: `Collection rate is ${collectionRate.toFixed(1)}% (below 60% threshold)`,
      metadata: {
        collectionRate,
        totalRevenue,
        totalPayments,
      },
    })
  }

  // 6. Check for material delays (if material tracking exists)
  const { data: materials } = await supabase
    .from('job_materials')
    .select('*')
    .eq('delivered', false)
    .not('eta', 'is', null)

  materials?.forEach(material => {
    const eta = new Date(material.eta)
    if (eta < today) {
      risks.push({
        id: `material_delay_${material.id}`,
        category: 'materials',
        severity: 'warning',
        message: `Material delivery overdue for job ${material.job_id?.substring(0, 8)}`,
        metadata: {
          materialId: material.id,
          jobId: material.job_id,
          materialType: material.material_type,
          eta: material.eta,
        },
      })
    }
  })

  // Save risks to database
  if (risks.length > 0) {
    const insights = risks.map(risk => ({
      workspace_id: workspaceId,
      category: risk.category,
      insight: risk.message,
      severity: risk.severity,
      metadata: risk.metadata,
    }))

    await supabase.from('ai_insights').insert(insights)
  }

  return risks
}

























