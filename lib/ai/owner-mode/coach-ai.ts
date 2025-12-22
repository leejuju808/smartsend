/**
 * CoachAI - Provides optimization insights and strategic guidance
 * Examples: pricing adjustments, crew improvements, marketing budget allocation, scheduling improvements
 */

import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface OptimizationSuggestion {
  category: string
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
  effort: 'low' | 'medium' | 'high'
  metadata: any
}

/**
 * Generate optimization suggestions
 */
export async function generateOptimizations(workspaceId: string): Promise<OptimizationSuggestion[]> {
  const supabase = createClient()
  const suggestions: OptimizationSuggestion[] = []

  // 1. Analyze pricing
  const { data: jobs } = await supabase
    .from('roofing_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)

  const avgJobValue = jobs?.length > 0
    ? jobs.reduce((sum, j) => sum + parseFloat(j.job_value || 0), 0) / jobs.length
    : 0

  // Check if pricing is below market average (simplified - would use real market data)
  const marketAverage = 15000 // Example market average
  if (avgJobValue < marketAverage * 0.9) {
    const suggestedIncrease = ((marketAverage - avgJobValue) / avgJobValue) * 100
    suggestions.push({
      category: 'pricing',
      title: 'Raise Pricing to Match Market',
      description: `Your average job value ($${avgJobValue.toLocaleString()}) is ${suggestedIncrease.toFixed(1)}% below market average. Consider raising prices by ${(suggestedIncrease * 0.5).toFixed(1)}% to improve margins.`,
      impact: 'high',
      effort: 'low',
      metadata: {
        currentAverage: avgJobValue,
        marketAverage,
        suggestedIncrease: suggestedIncrease * 0.5,
      },
    })
  }

  // 2. Analyze crew efficiency
  const { data: crews } = await supabase
    .from('crews')
    .select('*, crew_assignments(*, roofing_jobs(*))')
    .limit(20)

  crews?.forEach(crew => {
    const assignments = crew.crew_assignments || []
    const completedJobs = assignments.filter((a: any) => 
      a.roofing_jobs?.status === 'completed'
    )
    
    if (completedJobs.length > 0) {
      const avgJobValue = completedJobs.reduce((sum: number, a: any) => 
        sum + parseFloat(a.roofing_jobs?.job_value || 0), 0
      ) / completedJobs.length

      // Suggest crew specialization if they perform better on certain job types
      const smallJobs = completedJobs.filter((a: any) => 
        parseFloat(a.roofing_jobs?.job_value || 0) < 10000
      )
      const largeJobs = completedJobs.filter((a: any) => 
        parseFloat(a.roofing_jobs?.job_value || 0) >= 10000
      )

      if (smallJobs.length > largeJobs.length * 2) {
        suggestions.push({
          category: 'crew_optimization',
          title: `Optimize ${crew.name} for Smaller Jobs`,
          description: `${crew.name} completes smaller jobs more frequently. Consider assigning them primarily to jobs under $10k for better efficiency.`,
          impact: 'medium',
          effort: 'low',
          metadata: {
            crewId: crew.id,
            crewName: crew.name,
            smallJobCount: smallJobs.length,
            largeJobCount: largeJobs.length,
          },
        })
      }
    }
  })

  // 3. Analyze lead sources (if marketing data available)
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(200)

  // Group by source (if source field exists)
  const leadsBySource: Record<string, number> = {}
  leads?.forEach(lead => {
    const source = lead.source || lead.campaign_id || 'unknown'
    leadsBySource[source] = (leadsBySource[source] || 0) + 1
  })

  // Find low-performing sources
  const totalLeads = leads?.length || 0
  Object.entries(leadsBySource).forEach(([source, count]) => {
    const percentage = (count / totalLeads) * 100
    if (percentage < 5 && totalLeads > 20) {
      suggestions.push({
        category: 'marketing',
        title: `Review Low-Performing Lead Source`,
        description: `Source "${source}" generates only ${percentage.toFixed(1)}% of leads. Consider reallocating budget to higher-performing channels.`,
        impact: 'medium',
        effort: 'medium',
        metadata: {
          source,
          leadCount: count,
          percentage,
        },
      })
    }
  })

  // 4. Scheduling optimization
  const scheduledJobs = jobs?.filter(j => j.status === 'scheduled' && j.scheduled_start_date) || []
  const jobsByDay: Record<string, number> = {}
  
  scheduledJobs.forEach(job => {
    const day = new Date(job.scheduled_start_date).toLocaleDateString('en-US', { weekday: 'long' })
    jobsByDay[day] = (jobsByDay[day] || 0) + 1
  })

  // Suggest better day distribution
  const maxDay = Object.entries(jobsByDay).reduce((max, [day, count]) => 
    count > max.count ? { day, count } : max, { day: '', count: 0 }
  )

  if (maxDay.count > 0) {
    const totalScheduled = scheduledJobs.length
    const avgPerDay = totalScheduled / 5 // Assuming 5 work days
    if (maxDay.count > avgPerDay * 1.5) {
      suggestions.push({
        category: 'scheduling',
        title: 'Balance Weekly Schedule',
        description: `${maxDay.day}s have ${maxDay.count} jobs scheduled (above average). Consider redistributing to other days for better crew utilization.`,
        impact: 'medium',
        effort: 'low',
        metadata: {
          day: maxDay.day,
          jobCount: maxDay.count,
          averagePerDay: avgPerDay,
        },
      })
    }
  }

  // 5. Use AI to generate additional strategic insights
  try {
    const context = `
You are a business coach for roofing companies. Analyze this data and provide 2-3 strategic optimization suggestions.

Company Data:
- Total Jobs: ${jobs?.length || 0}
- Average Job Value: $${avgJobValue.toLocaleString()}
- Total Leads: ${leads?.length || 0}
- Crews: ${crews?.length || 0}

Provide suggestions in JSON format:
[
  {
    "category": "category_name",
    "title": "Short title",
    "description": "Detailed description",
    "impact": "high|medium|low",
    "effort": "high|medium|low"
  }
]
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a business coach. Return only valid JSON, no markdown.',
        },
        {
          role: 'user',
          content: context,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const aiResponse = completion.choices[0]?.message?.content || '{}'
    const aiSuggestions = JSON.parse(aiResponse)
    
    if (Array.isArray(aiSuggestions.suggestions)) {
      suggestions.push(...aiSuggestions.suggestions)
    }
  } catch (error) {
    console.error('AI optimization generation error:', error)
  }

  // Save suggestions as insights
  if (suggestions.length > 0) {
    const insights = suggestions.map(s => ({
      workspace_id: workspaceId,
      category: s.category,
      insight: `${s.title}: ${s.description}`,
      severity: s.impact === 'high' ? 'warning' : 'info',
      metadata: s.metadata,
    }))

    await supabase.from('ai_insights').insert(insights)
  }

  return suggestions
}

























