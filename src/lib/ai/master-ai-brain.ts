/**
 * Block 248000 — Master AI Brain v1
 * 
 * One Unified Intelligence for Sales, Production, Estimating, Customers, Finance, and Forecasting
 * 
 * This is the brain that makes SmartSend unstoppable.
 * SmartSend stops being a tool and becomes a living operating intelligence for roofing companies.
 */

import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/openai'
import { PredictAI } from '@/lib/ai-models'
import type { PersonalizeAI } from '@/lib/ai-models'

// ============================================================================
// TYPES
// ============================================================================

export interface CompanyContext {
  job_status: {
    total_jobs: number
    active_jobs: number
    completed_jobs: number
    delayed_jobs: number
    at_risk_jobs: number
  }
  crews: {
    total_crews: number
    active_crews: number
    available_crews: number
    assignments: Array<{
      crew_id: string
      job_id: string
      scheduled_date: string
    }>
  }
  schedules: {
    upcoming_jobs: number
    next_7_days: number
    next_30_days: number
    conflicts: number
  }
  leads: {
    total_leads: number
    hot_leads: number
    warm_leads: number
    cold_leads: number
    pipeline_value: number
    avg_close_rate: number
  }
  marketing: {
    active_campaigns: number
    total_spend: number
    roi: number
    leads_generated: number
  }
  profit_metrics: {
    total_revenue: number
    total_costs: number
    profit_margin: number
    avg_job_profit: number
  }
  bills: {
    outstanding_invoices: number
    total_outstanding: number
    overdue_count: number
    overdue_amount: number
  }
  materials: {
    pending_orders: number
    low_stock_items: number
    delivery_delays: number
  }
  weather_risks: {
    upcoming_alerts: number
    high_risk_days: number
    affected_jobs: number
  }
  customer_sentiment: {
    avg_rating: number
    recent_reviews: number
    complaints: number
    satisfaction_score: number
  }
}

export interface AIQueryResult {
  answer: string
  confidence: number
  sources: Array<{
    type: string
    id: string
    summary: string
  }>
  recommendations?: Array<{
    action: string
    priority: 'low' | 'medium' | 'high' | 'critical'
    reasoning: string
  }>
}

export interface DailyBriefing {
  date: string
  health_score: number
  health_status: string
  summary: string
  top_risks: Array<{
    title: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    description: string
    action: string
  }>
  top_opportunities: Array<{
    title: string
    impact: 'low' | 'medium' | 'high'
    description: string
    action: string
  }>
  key_metrics: {
    sales: number
    production: number
    finance: number
    customer: number
  }
  predictions: Array<{
    event: string
    probability: number
    timeframe: string
    impact: string
  }>
}

export interface AIRecommendation {
  id: string
  type: 'action' | 'alert' | 'optimization' | 'prediction'
  category: 'sales' | 'production' | 'finance' | 'customer' | 'marketing' | 'safety'
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  confidence: number
  reasoning: string
  action_type?: string
  action_data?: Record<string, any>
  related_lead_id?: string
  related_job_id?: string
  created_at: string
}

export interface CompanyHealthScore {
  overall_score: number
  sales_score: number
  production_score: number
  financial_score: number
  customer_score: number
  backlog_score: number
  weather_score: number
  materials_score: number
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  trend: 'improving' | 'stable' | 'declining'
  top_risks: Array<{
    title: string
    severity: string
    description: string
  }>
  top_opportunities: Array<{
    title: string
    impact: string
    description: string
  }>
  summary: string
}

// ============================================================================
// MASTER AI BRAIN CLASS
// ============================================================================

export class MasterAIBrain {
  private supabase: ReturnType<typeof createClient>
  private workspaceId: string

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId
    this.supabase = createClient()
  }

  /**
   * Query the AI about anything related to the company
   */
  async query(question: string): Promise<AIQueryResult> {
    // Get current global state
    const context = await this.getGlobalContext()
    
    // Get relevant recent events
    const recentEvents = await this.getRecentEvents(50)
    
    // Build comprehensive context for AI
    const systemPrompt = `You are the Master AI Brain for a roofing company. You have complete visibility into:
- All jobs, crews, schedules, and production
- All leads, sales pipeline, and marketing
- All financial data, invoices, and cashflow
- All customer interactions and sentiment
- Weather risks and material status
- Historical patterns and trends

You can reason across ALL company data to answer questions, predict problems, and recommend actions.

Your responses should be:
- Accurate and data-driven
- Actionable with specific recommendations
- Prioritized by impact
- Clear and concise

Always cite your sources and explain your reasoning.`

    const userPrompt = `Company Context:
${JSON.stringify(context, null, 2)}

Recent Events (last 24 hours):
${JSON.stringify(recentEvents.slice(0, 20), null, 2)}

Question: ${question}

Provide a comprehensive answer with:
1. Direct answer to the question
2. Confidence level (0-1)
3. Sources (what data you used)
4. Recommendations (if applicable)

Format as JSON.`

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })

      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No response from AI')

      const parsed = JSON.parse(response)
      
      return {
        answer: parsed.answer || 'Unable to generate answer',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        sources: parsed.sources || [],
        recommendations: parsed.recommendations || []
      }
    } catch (error) {
      console.error('Master AI Brain query error:', error)
      return {
        answer: 'I encountered an error processing your question. Please try rephrasing it.',
        confidence: 0.3,
        sources: [],
        recommendations: []
      }
    }
  }

  /**
   * Generate daily briefing
   */
  async generateDailyBriefing(): Promise<DailyBriefing> {
    const context = await this.getGlobalContext()
    const healthScore = await this.calculateHealthScore()
    const recentEvents = await this.getRecentEvents(100)
    
    const systemPrompt = `You are generating a daily briefing for a roofing company owner.

Analyze the company's current state and provide:
1. Overall health score and status
2. Top 3-5 risks that need attention
3. Top 3-5 opportunities to improve
4. Key metrics across all departments
5. Predictions for the next 7 days

Be specific, actionable, and prioritize by impact.`

    const userPrompt = `Company Context:
${JSON.stringify(context, null, 2)}

Current Health Score: ${healthScore.overall_score}/100 (${healthScore.status})

Recent Events:
${JSON.stringify(recentEvents.slice(0, 30), null, 2)}

Generate a comprehensive daily briefing. Format as JSON.`

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 2500,
        response_format: { type: 'json_object' }
      })

      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No response from AI')

      const parsed = JSON.parse(response)
      
      return {
        date: new Date().toISOString().split('T')[0],
        health_score: healthScore.overall_score,
        health_status: healthScore.status,
        summary: parsed.summary || 'Daily briefing generated',
        top_risks: parsed.top_risks || [],
        top_opportunities: parsed.top_opportunities || [],
        key_metrics: parsed.key_metrics || {
          sales: 0,
          production: 0,
          finance: 0,
          customer: 0
        },
        predictions: parsed.predictions || []
      }
    } catch (error) {
      console.error('Daily briefing generation error:', error)
      throw error
    }
  }

  /**
   * Get AI recommendations
   */
  async getRecommendations(limit: number = 20): Promise<AIRecommendation[]> {
    const { data: tasks } = await this.supabase
      .from('ai_tasks')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('status', 'open')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!tasks) return []

    return tasks.map(task => ({
      id: task.id,
      type: task.type as any,
      category: task.category as any,
      title: task.title,
      description: task.description,
      priority: task.priority as any,
      confidence: task.confidence_score,
      reasoning: task.reasoning || '',
      action_type: task.action_type || undefined,
      action_data: task.action_data || undefined,
      related_lead_id: task.related_lead_id || undefined,
      related_job_id: task.related_job_id || undefined,
      created_at: task.created_at
    }))
  }

  /**
   * Calculate company health score
   */
  async calculateHealthScore(): Promise<CompanyHealthScore> {
    const context = await this.getGlobalContext()
    
    // Calculate component scores
    const salesScore = this.calculateSalesScore(context)
    const productionScore = this.calculateProductionScore(context)
    const financialScore = this.calculateFinancialScore(context)
    const customerScore = this.calculateCustomerScore(context)
    const backlogScore = this.calculateBacklogScore(context)
    const weatherScore = this.calculateWeatherScore(context)
    const materialsScore = this.calculateMaterialsScore(context)
    
    // Overall score (weighted average)
    const overallScore = Math.round(
      (salesScore * 0.20) +
      (productionScore * 0.20) +
      (financialScore * 0.20) +
      (customerScore * 0.15) +
      (backlogScore * 0.10) +
      (weatherScore * 0.10) +
      (materialsScore * 0.05)
    )
    
    // Determine status
    let status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
    if (overallScore >= 85) status = 'excellent'
    else if (overallScore >= 70) status = 'good'
    else if (overallScore >= 55) status = 'fair'
    else if (overallScore >= 40) status = 'poor'
    else status = 'critical'
    
    // Get trend (compare with previous score if available)
    const trend = await this.getTrend()
    
    // Generate insights using AI
    const insights = await this.generateHealthInsights(context, overallScore)
    
    // Save health score
    await this.saveHealthScore({
      overall_score: overallScore,
      sales_score: salesScore,
      production_score: productionScore,
      financial_score: financialScore,
      customer_score: customerScore,
      backlog_score: backlogScore,
      weather_score: weatherScore,
      materials_score: materialsScore,
      status,
      trend,
      top_risks: insights.risks,
      top_opportunities: insights.opportunities,
      summary: insights.summary
    })
    
    return {
      overall_score: overallScore,
      sales_score: salesScore,
      production_score: productionScore,
      financial_score: financialScore,
      customer_score: customerScore,
      backlog_score: backlogScore,
      weather_score: weatherScore,
      materials_score: materialsScore,
      status,
      trend,
      top_risks: insights.risks,
      top_opportunities: insights.opportunities,
      summary: insights.summary
    }
  }

  /**
   * Update global context
   */
  async updateGlobalContext(): Promise<void> {
    const context = await this.gatherCompanyContext()
    
    // Get or create global state
    const { data: existing } = await this.supabase
      .from('ai_global_state')
      .select('id')
      .eq('workspace_id', this.workspaceId)
      .single()
    
    if (existing) {
      await this.supabase
        .from('ai_global_state')
        .update({
          context,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
    } else {
      await this.supabase
        .from('ai_global_state')
        .insert({
          workspace_id: this.workspaceId,
          context
        })
    }
  }

  /**
   * Process events and generate tasks
   */
  async processEvents(): Promise<void> {
    // Get unprocessed events
    const { data: events } = await this.supabase
      .from('ai_event_stream')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .is('processed_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (!events || events.length === 0) return
    
    const context = await this.getGlobalContext()
    
    // Use AI to analyze events and generate tasks
    const systemPrompt = `You are analyzing company events to identify risks, opportunities, and required actions.

For each important event, determine:
1. Does this require immediate action? (create task)
2. What is the priority? (low, medium, high, critical)
3. What category? (sales, production, finance, customer, marketing, safety)
4. What action should be taken?

Only create tasks for events that truly require attention.`

    const userPrompt = `Company Context:
${JSON.stringify(context, null, 2)}

Events to Analyze:
${JSON.stringify(events, null, 2)}

Generate tasks for events that require action. Format as JSON array of tasks.`

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 3000,
        response_format: { type: 'json_object' }
      })

      const response = completion.choices[0]?.message?.content
      if (!response) return

      const parsed = JSON.parse(response)
      const tasks = parsed.tasks || []
      
      // Insert tasks
      if (tasks.length > 0) {
        const tasksToInsert = tasks.map((task: any) => ({
          workspace_id: this.workspaceId,
          type: task.type || 'action',
          category: task.category || 'general',
          title: task.title,
          description: task.description,
          priority: task.priority || 'medium',
          confidence_score: task.confidence || 0.5,
          reasoning: task.reasoning || '',
          action_type: task.action_type,
          action_data: task.action_data || {},
          related_lead_id: task.related_lead_id,
          related_job_id: task.related_job_id
        }))
        
        await this.supabase
          .from('ai_tasks')
          .insert(tasksToInsert)
      }
      
      // Mark events as processed
      const eventIds = events.map(e => e.id)
      await this.supabase
        .from('ai_event_stream')
        .update({ processed_at: new Date().toISOString() })
        .in('id', eventIds)
    } catch (error) {
      console.error('Event processing error:', error)
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async getGlobalContext(): Promise<CompanyContext> {
    const { data: state } = await this.supabase
      .from('ai_global_state')
      .select('context')
      .eq('workspace_id', this.workspaceId)
      .single()
    
    if (state?.context) {
      return state.context as CompanyContext
    }
    
    // If no state exists, gather fresh context
    return await this.gatherCompanyContext()
  }

  private async gatherCompanyContext(): Promise<CompanyContext> {
    // Gather all company data
    const [jobs, leads, crews, schedules, invoices, materials] = await Promise.all([
      this.getJobsData(),
      this.getLeadsData(),
      this.getCrewsData(),
      this.getSchedulesData(),
      this.getInvoicesData(),
      this.getMaterialsData()
    ])
    
    return {
      job_status: {
        total_jobs: jobs.total,
        active_jobs: jobs.active,
        completed_jobs: jobs.completed,
        delayed_jobs: jobs.delayed,
        at_risk_jobs: jobs.at_risk
      },
      crews: {
        total_crews: crews.total,
        active_crews: crews.active,
        available_crews: crews.available,
        assignments: crews.assignments
      },
      schedules: {
        upcoming_jobs: schedules.upcoming,
        next_7_days: schedules.next7Days,
        next_30_days: schedules.next30Days,
        conflicts: schedules.conflicts
      },
      leads: {
        total_leads: leads.total,
        hot_leads: leads.hot,
        warm_leads: leads.warm,
        cold_leads: leads.cold,
        pipeline_value: leads.pipelineValue,
        avg_close_rate: leads.avgCloseRate
      },
      marketing: {
        active_campaigns: 0, // TODO: implement
        total_spend: 0,
        roi: 0,
        leads_generated: 0
      },
      profit_metrics: {
        total_revenue: jobs.totalRevenue,
        total_costs: jobs.totalCosts,
        profit_margin: jobs.profitMargin,
        avg_job_profit: jobs.avgJobProfit
      },
      bills: {
        outstanding_invoices: invoices.outstanding,
        total_outstanding: invoices.totalOutstanding,
        overdue_count: invoices.overdueCount,
        overdue_amount: invoices.overdueAmount
      },
      materials: {
        pending_orders: materials.pending,
        low_stock_items: materials.lowStock,
        delivery_delays: materials.delays
      },
      weather_risks: {
        upcoming_alerts: 0, // TODO: implement
        high_risk_days: 0,
        affected_jobs: 0
      },
      customer_sentiment: {
        avg_rating: 0, // TODO: implement
        recent_reviews: 0,
        complaints: 0,
        satisfaction_score: 0
      }
    }
  }

  private async getJobsData() {
    const { data: jobs } = await this.supabase
      .from('jobs')
      .select('id, status, estimated_value, final_value, stage, scheduled_date')
      .eq('workspace_id', this.workspaceId)
    
    if (!jobs) {
      return { total: 0, active: 0, completed: 0, delayed: 0, at_risk: 0, totalRevenue: 0, totalCosts: 0, profitMargin: 0, avgJobProfit: 0 }
    }
    
    const total = jobs.length
    const active = jobs.filter(j => j.status === 'in_progress' || j.stage === 'in_progress').length
    const completed = jobs.filter(j => j.status === 'completed' || j.stage === 'completed').length
    const delayed = jobs.filter(j => {
      if (!j.scheduled_date) return false
      const scheduled = new Date(j.scheduled_date)
      const now = new Date()
      return scheduled < now && (j.status !== 'completed' && j.stage !== 'completed')
    }).length
    
    const totalRevenue = jobs.reduce((sum, j) => sum + (parseFloat(j.final_value || j.estimated_value || '0') || 0), 0)
    const totalCosts = totalRevenue * 0.65 // Estimate 65% cost ratio
    const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalCosts) / totalRevenue) * 100 : 0
    const avgJobProfit = total > 0 ? (totalRevenue - totalCosts) / total : 0
    
    return { total, active, completed, delayed, at_risk: delayed, totalRevenue, totalCosts, profitMargin, avgJobProfit }
  }

  private async getLeadsData() {
    const { data: leads } = await this.supabase
      .from('leads')
      .select('id, status, estimated_value')
      .eq('workspace_id', this.workspaceId)
    
    if (!leads) {
      return { total: 0, hot: 0, warm: 0, cold: 0, pipelineValue: 0, avgCloseRate: 0 }
    }
    
    const total = leads.length
    const hot = leads.filter(l => l.status === 'hot' || l.status === 'qualified').length
    const warm = leads.filter(l => l.status === 'warm' || l.status === 'contacted').length
    const cold = leads.filter(l => !['hot', 'warm', 'qualified', 'contacted'].includes(l.status || '')).length
    const pipelineValue = leads.reduce((sum, l) => sum + (parseFloat(l.estimated_value || '0') || 0), 0)
    
    // Estimate close rate (would be better from historical data)
    const avgCloseRate = 25 // 25% default
    
    return { total, hot, warm, cold, pipelineValue, avgCloseRate }
  }

  private async getCrewsData() {
    // TODO: Implement crew data gathering
    return { total: 0, active: 0, available: 0, assignments: [] }
  }

  private async getSchedulesData() {
    const { data: jobs } = await this.supabase
      .from('jobs')
      .select('scheduled_date')
      .eq('workspace_id', this.workspaceId)
      .not('scheduled_date', 'is', null)
    
    if (!jobs) {
      return { upcoming: 0, next7Days: 0, next30Days: 0, conflicts: 0 }
    }
    
    const now = new Date()
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    
    const upcoming = jobs.length
    const next7DaysCount = jobs.filter(j => {
      const scheduled = new Date(j.scheduled_date)
      return scheduled <= next7Days && scheduled >= now
    }).length
    const next30DaysCount = jobs.filter(j => {
      const scheduled = new Date(j.scheduled_date)
      return scheduled <= next30Days && scheduled >= now
    }).length
    
    return { upcoming, next7Days: next7DaysCount, next30Days: next30DaysCount, conflicts: 0 }
  }

  private async getInvoicesData() {
    // TODO: Implement invoice data gathering
    return { outstanding: 0, totalOutstanding: 0, overdueCount: 0, overdueAmount: 0 }
  }

  private async getMaterialsData() {
    // TODO: Implement materials data gathering
    return { pending: 0, lowStock: 0, delays: 0 }
  }

  private async getRecentEvents(limit: number) {
    const { data: events } = await this.supabase
      .from('ai_event_stream')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    return events || []
  }

  private calculateSalesScore(context: CompanyContext): number {
    const { leads } = context
    let score = 50 // Base score
    
    // Hot leads boost
    if (leads.total_leads > 0) {
      const hotRatio = leads.hot_leads / leads.total_leads
      score += hotRatio * 30
    }
    
    // Pipeline value boost
    if (leads.pipeline_value > 100000) score += 10
    else if (leads.pipeline_value > 50000) score += 5
    
    // Close rate boost
    if (leads.avg_close_rate > 30) score += 10
    else if (leads.avg_close_rate > 20) score += 5
    
    return Math.min(100, Math.max(0, score))
  }

  private calculateProductionScore(context: CompanyContext): number {
    const { job_status } = context
    let score = 50
    
    // Completion rate
    if (job_status.total_jobs > 0) {
      const completionRate = job_status.completed_jobs / job_status.total_jobs
      score += completionRate * 30
    }
    
    // Delay penalty
    if (job_status.total_jobs > 0) {
      const delayRate = job_status.delayed_jobs / job_status.total_jobs
      score -= delayRate * 40
    }
    
    return Math.min(100, Math.max(0, score))
  }

  private calculateFinancialScore(context: CompanyContext): number {
    const { profit_metrics, bills } = context
    let score = 50
    
    // Profit margin boost
    if (profit_metrics.profit_margin > 30) score += 20
    else if (profit_metrics.profit_margin > 20) score += 10
    else if (profit_metrics.profit_margin < 10) score -= 20
    
    // Outstanding bills penalty
    if (bills.overdue_amount > 50000) score -= 20
    else if (bills.overdue_amount > 20000) score -= 10
    
    return Math.min(100, Math.max(0, score))
  }

  private calculateCustomerScore(context: CompanyContext): number {
    const { customer_sentiment } = context
    let score = 50
    
    // Rating boost
    if (customer_sentiment.avg_rating >= 4.5) score += 30
    else if (customer_sentiment.avg_rating >= 4.0) score += 15
    else if (customer_sentiment.avg_rating < 3.5) score -= 20
    
    // Complaints penalty
    if (customer_sentiment.complaints > 5) score -= 15
    else if (customer_sentiment.complaints > 2) score -= 5
    
    return Math.min(100, Math.max(0, score))
  }

  private calculateBacklogScore(context: CompanyContext): number {
    const { schedules } = context
    let score = 50
    
    // Healthy backlog
    if (schedules.next_30_days >= 10) score += 20
    else if (schedules.next_30_days >= 5) score += 10
    else if (schedules.next_30_days < 2) score -= 20
    
    // Conflicts penalty
    if (schedules.conflicts > 3) score -= 15
    
    return Math.min(100, Math.max(0, score))
  }

  private calculateWeatherScore(context: CompanyContext): number {
    const { weather_risks } = context
    let score = 100 // Start perfect
    
    // Weather risk penalty
    if (weather_risks.high_risk_days > 5) score -= 30
    else if (weather_risks.high_risk_days > 2) score -= 15
    
    if (weather_risks.affected_jobs > 10) score -= 20
    else if (weather_risks.affected_jobs > 5) score -= 10
    
    return Math.min(100, Math.max(0, score))
  }

  private calculateMaterialsScore(context: CompanyContext): number {
    const { materials } = context
    let score = 100 // Start perfect
    
    // Material issues penalty
    if (materials.delivery_delays > 5) score -= 30
    else if (materials.delivery_delays > 2) score -= 15
    
    if (materials.low_stock_items > 10) score -= 20
    
    return Math.min(100, Math.max(0, score))
  }

  private async getTrend(): Promise<'improving' | 'stable' | 'declining'> {
    // Get previous health score
    const { data: previous } = await this.supabase
      .from('ai_company_health')
      .select('overall_score')
      .eq('workspace_id', this.workspaceId)
      .order('calculated_at', { ascending: false })
      .limit(2)
    
    if (!previous || previous.length < 2) return 'stable'
    
    const current = previous[0].overall_score
    const past = previous[1].overall_score
    
    if (current > past + 5) return 'improving'
    if (current < past - 5) return 'declining'
    return 'stable'
  }

  private async generateHealthInsights(context: CompanyContext, score: number) {
    const systemPrompt = `Analyze company health and generate insights.`
    
    const userPrompt = `Company Context:
${JSON.stringify(context, null, 2)}

Health Score: ${score}/100

Generate:
1. Top 3-5 risks (with severity)
2. Top 3-5 opportunities (with impact)
3. Summary paragraph

Format as JSON.`

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      })

      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No response')
      
      const parsed = JSON.parse(response)
      return {
        risks: parsed.top_risks || [],
        opportunities: parsed.top_opportunities || [],
        summary: parsed.summary || 'Health analysis complete.'
      }
    } catch (error) {
      console.error('Health insights generation error:', error)
      return {
        risks: [],
        opportunities: [],
        summary: 'Unable to generate insights at this time.'
      }
    }
  }

  private async saveHealthScore(health: Partial<CompanyHealthScore>) {
    await this.supabase
      .from('ai_company_health')
      .insert({
        workspace_id: this.workspaceId,
        overall_score: health.overall_score,
        sales_score: health.sales_score,
        production_score: health.production_score,
        financial_score: health.financial_score,
        customer_score: health.customer_score,
        backlog_score: health.backlog_score,
        weather_score: health.weather_score,
        materials_score: health.materials_score,
        status: health.status,
        trend: health.trend,
        top_risks: health.top_risks || [],
        top_opportunities: health.top_opportunities || [],
        summary: health.summary
      })
  }
}

























