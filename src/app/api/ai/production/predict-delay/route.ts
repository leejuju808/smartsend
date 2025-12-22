import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'
import { PredictAI } from '@/lib/ai-models'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * POST /api/ai/production/predict-delay
 * Predict production delays
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { user, workspace_id } = gate
    const supabase = getServerSupabase()

    const body: {
      jobId: string
      scheduledDate: string
      weatherForecast?: string
    } = await req.json()

    if (!body.jobId || !body.scheduledDate) {
      return NextResponse.json(
        { error: 'Missing required fields: jobId, scheduledDate' },
        { status: 400 }
      )
    }

    // Get job data
    const { data: job } = await supabase
      .from('jobs')
      .select('crew_id, job_type')
      .eq('id', body.jobId)
      .single()

    // Get crew history
    let crewHistory = []
    if (job?.crew_id) {
      const { data: crewJobs } = await supabase
        .from('jobs')
        .select('scheduled_start_date, actual_start_date, status')
        .eq('crew_id', job.crew_id)
        .eq('workspace_id', workspace_id)
        .not('scheduled_start_date', 'is', null)
        .limit(20)

      crewHistory = crewJobs?.map(j => ({
        crewId: job.crew_id,
        avgDelayDays: j.scheduled_start_date && j.actual_start_date
          ? Math.max(0, Math.floor(
              (new Date(j.actual_start_date).getTime() - new Date(j.scheduled_start_date).getTime()) / (1000 * 60 * 60 * 24)
            ))
          : 0
      })) || []
    }

    // Get material delivery patterns
    const materialDeliveryPatterns = []

    // Predict delay
    const result = await PredictAI.predictProductionDelay({
      scheduledDate: body.scheduledDate,
      weatherForecast: body.weatherForecast,
      crewHistory,
      materialDeliveryPatterns
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in /api/ai/production/predict-delay:', error)
    return NextResponse.json(
      { error: 'Failed to predict production delay' },
      { status: 500 }
    )
  }
}

























