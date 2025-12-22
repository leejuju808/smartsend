/**
 * CompanyAI - Answers ANY question about the company
 * Pulls from ALL data sources: Jobs, Leads, Sales, Scheduling, Materials, Crews, Billing, Weather, Reporting, Marketing, Customer messages
 */

import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface CompanyData {
  jobs: any[]
  leads: any[]
  sales: any[]
  crews: any[]
  materials: any[]
  billing: any[]
  weather: any[]
  marketing: any[]
  messages: any[]
  metrics: {
    totalRevenue: number
    totalJobs: number
    activeJobs: number
    completedJobs: number
    totalLeads: number
    conversionRate: number
    averageJobValue: number
    crewCount: number
  }
}

/**
 * Gather all company data for AI context
 */
async function gatherCompanyData(workspaceId: string): Promise<CompanyData> {
  const supabase = createClient()

  // Get jobs
  const { data: jobs } = await supabase
    .from('roofing_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)

  // Get leads
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)

  // Get crews
  const { data: crews } = await supabase
    .from('crews')
    .select('*, crew_members(*)')
    .eq('team_id', workspaceId) // Adjust based on your schema

  // Get materials (if table exists)
  const { data: materials } = await supabase
    .from('job_materials')
    .select('*')
    .limit(50)

  // Get billing/payments (if table exists)
  const { data: billing } = await supabase
    .from('payments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .limit(50)

  // Calculate metrics
  const totalJobs = jobs?.length || 0
  const activeJobs = jobs?.filter(j => j.status === 'in_progress' || j.status === 'scheduled').length || 0
  const completedJobs = jobs?.filter(j => j.status === 'completed').length || 0
  const totalLeads = leads?.length || 0
  const totalRevenue = jobs?.reduce((sum, j) => sum + (parseFloat(j.job_value || 0)), 0) || 0
  const averageJobValue = totalJobs > 0 ? totalRevenue / totalJobs : 0
  const conversionRate = totalLeads > 0 ? (totalJobs / totalLeads) * 100 : 0

  return {
    jobs: jobs || [],
    leads: leads || [],
    sales: [], // Add sales data if available
    crews: crews || [],
    materials: materials || [],
    billing: billing || [],
    weather: [], // Add weather data if available
    marketing: [], // Add marketing data if available
    messages: [], // Add customer messages if available
    metrics: {
      totalRevenue,
      totalJobs,
      activeJobs,
      completedJobs,
      totalLeads,
      conversionRate,
      averageJobValue,
      crewCount: crews?.length || 0,
    },
  }
}

/**
 * Answer a question about the company using AI
 */
export async function answerCompanyQuestion(
  workspaceId: string,
  userId: string,
  question: string
): Promise<{ answer: string; contextData: any }> {
  try {
    // Gather all company data
    const companyData = await gatherCompanyData(workspaceId)

    // Build context for AI
    const context = `
You are SmartSend AI, an intelligent business assistant for roofing companies. Answer the owner's question using the company data provided.

COMPANY DATA:
- Total Revenue: $${companyData.metrics.totalRevenue.toLocaleString()}
- Total Jobs: ${companyData.metrics.totalJobs}
- Active Jobs: ${companyData.metrics.activeJobs}
- Completed Jobs: ${companyData.metrics.completedJobs}
- Total Leads: ${companyData.metrics.totalLeads}
- Conversion Rate: ${companyData.metrics.conversionRate.toFixed(1)}%
- Average Job Value: $${companyData.metrics.averageJobValue.toLocaleString()}
- Crew Count: ${companyData.metrics.crewCount}

RECENT JOBS (last 10):
${companyData.jobs.slice(0, 10).map(j => 
  `- Job ${j.id?.substring(0, 8)}: ${j.status || 'unknown'} | Value: $${parseFloat(j.job_value || 0).toLocaleString()} | Stage: ${j.stage || 'N/A'}`
).join('\n')}

RECENT LEADS (last 10):
${companyData.leads.slice(0, 10).map(l => 
  `- Lead ${l.id?.substring(0, 8)}: ${l.email || 'N/A'} | Status: ${l.status || 'N/A'}`
).join('\n')}

CREWS:
${companyData.crews.map(c => `- ${c.name || 'Unnamed Crew'}: ${c.crew_members?.length || 0} members`).join('\n')}

Answer the question directly, concisely, and with specific numbers when available. If you don't have enough data, say so.
`

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: context,
        },
        {
          role: 'user',
          content: question,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    })

    const answer = completion.choices[0]?.message?.content || 'I could not generate an answer. Please try again.'

    // Save query to database
    const supabase = createClient()
    await supabase.from('ai_queries').insert({
      workspace_id: workspaceId,
      user_id: userId,
      question,
      answer,
      context_data: {
        metrics: companyData.metrics,
        jobCount: companyData.jobs.length,
        leadCount: companyData.leads.length,
      },
    })

    return {
      answer,
      contextData: {
        metrics: companyData.metrics,
        jobCount: companyData.jobs.length,
        leadCount: companyData.leads.length,
      },
    }
  } catch (error) {
    console.error('CompanyAI error:', error)
    throw new Error('Failed to answer question. Please try again.')
  }
}

























