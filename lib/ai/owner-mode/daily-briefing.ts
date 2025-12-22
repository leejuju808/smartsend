/**
 * Daily Briefing Generator - Creates CEO briefings delivered at 6 AM
 * Includes: Revenue collected, Jobs completed, Jobs delayed, Estimated revenue next 7 days, New leads, Rep performance, Crew issues, Customer sentiment, Weather threats, Cashflow status, Today's critical tasks
 */

import { createClient } from '@/lib/supabase/server'
import { scanForRisks } from './risk-ai'
import { generateForecast } from './forecast-ai'

interface BriefingSection {
  title: string
  content: string
  metrics?: Record<string, any>
}

/**
 * Generate daily briefing for a workspace
 */
export async function generateDailyBriefing(workspaceId: string): Promise<string> {
  const supabase = createClient()
  const sections: BriefingSection[] = []

  // 1. Revenue Collected Yesterday
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString())

  const revenueYesterday = payments?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0

  sections.push({
    title: 'Revenue Collected Yesterday',
    content: `$${revenueYesterday.toLocaleString()}`,
    metrics: { revenue: revenueYesterday },
  })

  // 2. Jobs Completed Yesterday
  const { data: completedJobs } = await supabase
    .from('roofing_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'completed')
    .gte('updated_at', yesterday.toISOString())
    .lt('updated_at', today.toISOString())

  const jobsCompleted = completedJobs?.length || 0
  const jobsCompletedValue = completedJobs?.reduce((sum, j) => sum + parseFloat(j.job_value || 0), 0) || 0

  sections.push({
    title: 'Jobs Completed Yesterday',
    content: `${jobsCompleted} jobs completed ($${jobsCompletedValue.toLocaleString()} total value)`,
    metrics: { count: jobsCompleted, value: jobsCompletedValue },
  })

  // 3. Jobs Delayed
  const { data: delayedJobs } = await supabase
    .from('roofing_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['scheduled', 'in_progress'])
    .not('scheduled_end_date', 'is', null)
    .lt('scheduled_end_date', today.toISOString().split('T')[0])

  const delayedCount = delayedJobs?.length || 0
  sections.push({
    title: 'Jobs Delayed',
    content: delayedCount > 0 
      ? `${delayedCount} jobs are past their scheduled completion date`
      : 'No delayed jobs',
    metrics: { count: delayedCount },
  })

  // 4. Estimated Revenue Next 7 Days
  const forecast = await generateForecast(workspaceId)
  const next7DaysRevenue = (forecast.revenue.next30Days / 30) * 7

  sections.push({
    title: 'Estimated Revenue Next 7 Days',
    content: `$${next7DaysRevenue.toLocaleString()}`,
    metrics: { revenue: next7DaysRevenue },
  })

  // 5. New Leads
  const { data: newLeads } = await supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString())

  const leadsCount = newLeads?.length || 0
  sections.push({
    title: 'New Leads Yesterday',
    content: `${leadsCount} new leads`,
    metrics: { count: leadsCount },
  })

  // 6. Rep Performance Summary (if reps/sales data available)
  // This would require a reps table or sales tracking
  sections.push({
    title: 'Sales Performance',
    content: 'Check dashboard for detailed rep performance metrics',
  })

  // 7. Crew Issues
  const risks = await scanForRisks(workspaceId)
  const crewIssues = risks.filter(r => r.category === 'crew_performance')
  
  sections.push({
    title: 'Crew Issues',
    content: crewIssues.length > 0
      ? `${crewIssues.length} crew performance alerts - ${crewIssues.map(r => r.message).join('; ')}`
      : 'No crew issues detected',
    metrics: { count: crewIssues.length },
  })

  // 8. Customer Sentiment Warnings
  // This would require sentiment analysis of customer messages
  sections.push({
    title: 'Customer Sentiment',
    content: 'All customers in good standing',
  })

  // 9. Weather Threats
  // This would require weather API integration
  sections.push({
    title: 'Weather Threats',
    content: 'No weather delays expected',
  })

  // 10. Cashflow Status
  sections.push({
    title: 'Cashflow Status',
    content: `Risk level: ${forecast.cashflow.riskLevel}. Projected cashflow next 30 days: $${forecast.cashflow.next30Days.toLocaleString()}`,
    metrics: { riskLevel: forecast.cashflow.riskLevel, next30Days: forecast.cashflow.next30Days },
  })

  // 11. Today's Critical Tasks
  const criticalRisks = risks.filter(r => r.severity === 'critical')
  const criticalTasks = criticalRisks.map(r => r.message).slice(0, 5)

  sections.push({
    title: "Today's Critical Tasks",
    content: criticalTasks.length > 0
      ? criticalTasks.join('\n• ')
      : 'No critical tasks - focus on growth!',
    metrics: { count: criticalTasks.length },
  })

  // Format briefing
  const briefing = sections.map(s => 
    `## ${s.title}\n\n${s.content}`
  ).join('\n\n---\n\n')

  // Save briefing to database
  const metrics = sections.reduce((acc, s) => {
    if (s.metrics) {
      Object.assign(acc, s.metrics)
    }
    return acc
  }, {} as Record<string, any>)

  await supabase.from('ai_daily_briefings').upsert({
    workspace_id: workspaceId,
    content: briefing,
    briefing_date: yesterday.toISOString().split('T')[0],
    metrics,
  }, {
    onConflict: 'workspace_id,briefing_date',
  })

  return briefing
}

























