import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'
import { PredictAI, JobForecastInput } from '@/lib/ai-models'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * POST /api/ai/forecast-job
 * Forecast job profitability and risk
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { user, workspace_id } = gate
    const supabase = getServerSupabase()

    const body: { jobId: string; input?: JobForecastInput } = await req.json()

    if (!body.jobId) {
      return NextResponse.json(
        { error: 'Missing required field: jobId' },
        { status: 400 }
      )
    }

    // Get job data if input not provided
    let forecastInput: JobForecastInput
    if (body.input) {
      forecastInput = body.input
    } else {
      // Fetch job data
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', body.jobId)
        .single()

      if (jobError || !job) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        )
      }

      // Get crew history
      const crewId = job.crew_id
      let crewHistory = []
      if (crewId) {
        const { data: crewJobs } = await supabase
          .from('jobs')
          .select('final_value, estimated_value, status, created_at')
          .eq('crew_id', crewId)
          .eq('workspace_id', workspace_id)
          .limit(20)

        crewHistory = crewJobs?.map(j => ({
          crewId: crewId,
          avgJobDuration: null, // TODO: Calculate from job dates
          avgCostVariance: j.estimated_value && j.final_value
            ? ((j.final_value - j.estimated_value) / j.estimated_value) * 100
            : 0,
          safetyIncidents: 0 // TODO: Get from safety records
        })) || []
      }

      // Get material history (if available)
      const materialHistory = []

      // Get weather data (if available)
      const weatherData = {}

      forecastInput = {
        jobData: {
          jobValue: job.final_value || job.estimated_value || 0,
          estimatedCost: job.estimated_value || 0,
          jobType: job.job_type,
          roofType: job.roof_type,
          squareFootage: null, // TODO: Get from job details
          complexity: 'moderate' // TODO: Determine from job data
        },
        crewHistory,
        materialHistory,
        weatherData
      }
    }

    // Forecast the job
    const result = await PredictAI.forecastJob(forecastInput)

    // Save to database
    try {
      await supabase.from('ai_job_forecasts').insert({
        job_id: body.jobId,
        workspace_id,
        predicted_profit: result.predictedProfit,
        predicted_margin: result.predictedMargin,
        predicted_cost: result.predictedCost,
        risk_level: result.riskLevel,
        risk_factors: result.riskFactors,
        recommendations: result.recommendations
      })
    } catch (dbError) {
      console.error('Failed to save job forecast:', dbError)
      // Don't fail the request if DB save fails
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in /api/ai/forecast-job:', error)
    return NextResponse.json(
      { error: 'Failed to forecast job' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ai/forecast-job?jobId=xxx
 * Get latest forecast for a job
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()

    const jobId = new URL(req.url).searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId parameter' },
        { status: 400 }
      )
    }

    const { data: forecast, error } = await supabase
      .from('ai_job_forecasts')
      .select('*')
      .eq('job_id', jobId)
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !forecast) {
      return NextResponse.json(
        { error: 'No forecast found for this job' },
        { status: 404 }
      )
    }

    return NextResponse.json(forecast)
  } catch (error) {
    console.error('Error in GET /api/ai/forecast-job:', error)
    return NextResponse.json(
      { error: 'Failed to get job forecast' },
      { status: 500 }
    )
  }
}

























