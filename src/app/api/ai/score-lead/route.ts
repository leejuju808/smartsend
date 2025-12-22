import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'
import { PredictAI, LeadScoringInput } from '@/lib/ai-models'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * POST /api/ai/score-lead
 * Score a lead and predict close probability
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { user, workspace_id } = gate
    const supabase = getServerSupabase()

    const body: { leadId: string; input?: LeadScoringInput } = await req.json()

    if (!body.leadId) {
      return NextResponse.json(
        { error: 'Missing required field: leadId' },
        { status: 400 }
      )
    }

    // Get lead data if input not provided
    let scoringInput: LeadScoringInput
    if (body.input) {
      scoringInput = body.input
    } else {
      // Fetch lead data
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', body.leadId)
        .single()

      if (leadError || !lead) {
        return NextResponse.json(
          { error: 'Lead not found' },
          { status: 404 }
        )
      }

      // Get homeowner behavior (proposal opens, replies, etc.)
      // This would need to be implemented based on your tracking system
      const homeownerBehavior = {
        proposalOpens: 0, // TODO: Get from tracking
        proposalClicks: 0,
        emailReplies: 0,
        callLogs: 0
      }

      // Get historical job data for similar leads
      const { data: historicalJobs } = await supabase
        .from('jobs')
        .select('final_value, status, created_at')
        .eq('workspace_id', workspace_id)
        .limit(100)

      scoringInput = {
        leadAttributes: {
          email: lead.email,
          firstName: lead.first_name,
          lastName: lead.last_name,
          phone: lead.phone,
          source: lead.source,
          status: lead.status,
          createdAt: lead.created_at
        },
        homeownerBehavior,
        historicalJobData: historicalJobs?.map(job => ({
          jobValue: job.final_value || 0,
          closed: job.status === 'won' || job.status === 'completed',
          daysToClose: null // TODO: Calculate from created_at
        })) || []
      }
    }

    // Score the lead
    const result = await PredictAI.scoreLead(scoringInput)

    // Save to database
    try {
      await supabase.from('ai_lead_scores').insert({
        lead_id: body.leadId,
        workspace_id,
        score: result.score,
        confidence: result.confidence,
        classification: result.classification,
        reason: result.reason,
        factors: result.factors
      })
    } catch (dbError) {
      console.error('Failed to save lead score:', dbError)
      // Don't fail the request if DB save fails
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in /api/ai/score-lead:', error)
    return NextResponse.json(
      { error: 'Failed to score lead' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ai/score-lead?leadId=xxx
 * Get latest score for a lead
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()

    const leadId = new URL(req.url).searchParams.get('leadId')
    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing leadId parameter' },
        { status: 400 }
      )
    }

    const { data: score, error } = await supabase
      .from('ai_lead_scores')
      .select('*')
      .eq('lead_id', leadId)
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !score) {
      return NextResponse.json(
        { error: 'No score found for this lead' },
        { status: 404 }
      )
    }

    return NextResponse.json(score)
  } catch (error) {
    console.error('Error in GET /api/ai/score-lead:', error)
    return NextResponse.json(
      { error: 'Failed to get lead score' },
      { status: 500 }
    )
  }
}

























