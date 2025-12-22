import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'
import { PredictAI, SafetyPredictionInput } from '@/lib/ai-models'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * POST /api/ai/safety/predict
 * Predict safety risk for a crew/job
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { user, workspace_id } = gate
    const supabase = getServerSupabase()

    const body: { crewId?: string; jobId?: string; input?: SafetyPredictionInput } = await req.json()

    if (!body.crewId && !body.jobId) {
      return NextResponse.json(
        { error: 'Missing required field: crewId or jobId' },
        { status: 400 }
      )
    }

    // Get safety data if input not provided
    let predictionInput: SafetyPredictionInput
    if (body.input) {
      predictionInput = body.input
    } else {
      // Fetch crew/job data
      let crewId = body.crewId
      let jobId = body.jobId

      if (jobId && !crewId) {
        // Get crew from job
        const { data: job } = await supabase
          .from('jobs')
          .select('crew_id')
          .eq('id', jobId)
          .single()
        crewId = job?.crew_id
      }

      // Get crew history
      let crewHistory = {}
      if (crewId) {
        // Get previous incidents for this crew
        const { data: incidents } = await supabase
          .from('safety_incidents')
          .select('*')
          .eq('crew_id', crewId)
          .eq('workspace_id', workspace_id)
          .limit(10)

        crewHistory = {
          previousIncidents: incidents?.length || 0,
          ppeCompliance: 0.8, // TODO: Calculate from safety records
          trainingLevel: 'standard' // TODO: Get from crew data
        }
      }

      // Get job conditions
      const jobConditions = {}
      if (jobId) {
        const { data: job } = await supabase
          .from('jobs')
          .select('job_type, roof_type, address')
          .eq('id', jobId)
          .single()

        jobConditions.height = 20 // TODO: Estimate from roof type
        jobConditions.weather = 'clear' // TODO: Get from weather API
        jobConditions.complexity = job?.job_type || 'moderate'
      }

      // Get recent safety issues
      const recentSafetyIssues = []

      predictionInput = {
        crewId,
        jobId,
        crewHistory,
        jobConditions,
        recentSafetyIssues
      }
    }

    // Predict safety risk
    const result = await PredictAI.predictSafety(predictionInput)

    // Save to database
    try {
      await supabase.from('ai_safety_predictions').insert({
        crew_id: predictionInput.crewId,
        job_id: predictionInput.jobId,
        workspace_id,
        risk_score: result.riskScore,
        risk_factors: result.riskFactors,
        recommended_actions: result.recommendedActions
      })
    } catch (dbError) {
      console.error('Failed to save safety prediction:', dbError)
      // Don't fail the request if DB save fails
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in /api/ai/safety/predict:', error)
    return NextResponse.json(
      { error: 'Failed to predict safety risk' },
      { status: 500 }
    )
  }
}

























