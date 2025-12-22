import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

/**
 * POST /api/inbox-v2/threads/:id/action
 * Handle swipe actions and quick actions from mobile inbox
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const threadId = params.id
    const body = await req.json()
    const { action } = body

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 })
    }

    // Verify thread exists and user has access
    const { data: thread, error: threadError } = await supabase
      .from('inbox_threads')
      .select('id, campaign_id, contact_id')
      .eq('id', threadId)
      .single()

    if (threadError || !thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Handle different actions
    let updateData: any = {}
    let pipelineStage: string | null = null

    switch (action) {
      case 'follow_up':
        updateData = {
          pipeline_stage_key: 'follow_up',
          updated_at: new Date().toISOString(),
        }
        pipelineStage = 'follow_up'
        break

      case 'hot':
        updateData = {
          pipeline_stage_key: 'hot',
          updated_at: new Date().toISOString(),
        }
        pipelineStage = 'hot'
        break

      case 'completed':
      case 'archived':
        updateData = {
          status: 'archived',
          updated_at: new Date().toISOString(),
        }
        break

      case 'not_interested':
        updateData = {
          pipeline_stage_key: 'not_interested',
          status: 'archived',
          updated_at: new Date().toISOString(),
        }
        pipelineStage = 'not_interested'
        break

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

    // Update thread
    const { error: updateError } = await supabase
      .from('inbox_threads')
      .update(updateData)
      .eq('id', threadId)

    if (updateError) {
      console.error('Error updating thread:', updateError)
      return NextResponse.json(
        { error: 'Failed to update thread' },
        { status: 500 }
      )
    }

    // If pipeline stage changed, also update via pipeline endpoint logic
    if (pipelineStage) {
      // Optionally trigger pipeline update webhook or other side effects
      // This is handled by the pipeline endpoint, but we can call it here if needed
    }

    return NextResponse.json({
      success: true,
      action,
      thread_id: threadId,
    })
  } catch (error: any) {
    console.error('Error handling thread action:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



















































