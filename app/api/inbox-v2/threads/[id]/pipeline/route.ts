import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/inbox-v2/threads/[id]/pipeline
 * Update pipeline stage for a thread
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()
    const threadId = params.id

    const body = await req.json()
    const { stage } = body

    if (!stage) {
      return NextResponse.json(
        { error: 'stage is required' },
        { status: 400 }
      )
    }

    // Get thread
    const { data: thread } = await supabase
      .from('inbox_threads')
      .select('contact_id')
      .eq('id', threadId)
      .single()

    if (!thread) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      )
    }

    // Update thread pipeline stage
    const { error: updateError } = await supabase
      .from('inbox_threads')
      .update({
        pipeline_stage_key: stage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId)

    if (updateError) {
      console.error('Error updating pipeline:', updateError)
      return NextResponse.json(
        { error: 'Failed to update pipeline', details: updateError.message },
        { status: 500 }
      )
    }

    // If contact exists, update contact pipeline stage
    if (thread.contact_id) {
      // Use the auto_move_pipeline_stage function if available
      await supabase.rpc('auto_move_pipeline_stage', {
        p_contact_id: thread.contact_id,
        p_new_stage_key: stage,
        p_trigger_type: 'user_action',
        p_trigger_data: { reason: 'Manual update from inbox' },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in POST /api/inbox-v2/threads/[id]/pipeline:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}





















































