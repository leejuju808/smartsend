import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'
import { InsuranceAI, SupplementGenerationInput } from '@/lib/ai-models'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * POST /api/ai/supplement/generate
 * Generate supplement justification
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { user, workspace_id } = gate
    const supabase = getServerSupabase()

    const body: { jobId: string; supplementId?: string; input?: SupplementGenerationInput } = await req.json()

    if (!body.jobId) {
      return NextResponse.json(
        { error: 'Missing required field: jobId' },
        { status: 400 }
      )
    }

    // Get supplement data if input not provided
    let generationInput: SupplementGenerationInput
    if (body.input) {
      generationInput = body.input
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

      // Get crew issues
      const { data: crewIssues } = await supabase
        .from('crew_issues')
        .select('*')
        .eq('job_id', body.jobId)
        .eq('workspace_id', workspace_id)

      // Get Xactimate line items (if available)
      const xactimateLineItems = []

      // Get insurance scope (if available)
      const { data: insuranceScope } = await supabase
        .from('insurance_scopes')
        .select('*')
        .eq('job_id', body.jobId)
        .eq('workspace_id', workspace_id)
        .limit(1)
        .single()

      generationInput = {
        crewIssues: crewIssues?.map(issue => ({
          issue: issue.issue_type || issue.description || '',
          severity: issue.severity || 'medium',
          description: issue.description
        })) || [],
        xactimateLineItems,
        insuranceScope: insuranceScope ? {
          total: insuranceScope.total || 0,
          lineItems: []
        } : undefined,
        jobDetails: {
          jobType: job.job_type,
          roofType: job.roof_type,
          squareFootage: null, // TODO: Get from job details
          damageDescription: job.notes || ''
        }
      }
    }

    // Generate supplement justification
    const result = await InsuranceAI.generateSupplementJustification(generationInput)

    // Save to database
    try {
      await supabase.from('ai_supplements_generated').insert({
        job_id: body.jobId,
        supplement_id: body.supplementId,
        workspace_id,
        justification: result.justification,
        code_references: result.codeReferences,
        xactimate_logic: result.xactimateLogic,
        missing_items: result.missingItems
      })
    } catch (dbError) {
      console.error('Failed to save supplement generation:', dbError)
      // Don't fail the request if DB save fails
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in /api/ai/supplement/generate:', error)
    return NextResponse.json(
      { error: 'Failed to generate supplement justification' },
      { status: 500 }
    )
  }
}

























