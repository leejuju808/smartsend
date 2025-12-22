import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/calls/thread/[threadId]
 * Get call history for a specific thread
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = createClient()
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const threadId = params.threadId

    // Verify thread access
    const { data: thread } = await supabase
      .from('inbox_threads')
      .select('id, workspace_id')
      .eq('id', threadId)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Verify workspace access
    const { data: workspace } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', thread.workspace_id)
      .eq('user_id', user.id)
      .single()

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    }

    // Get call history for this thread
    const { data: calls, error: callsError } = await supabase
      .from('call_transcripts')
      .select(`
        id,
        call_timestamp,
        duration_seconds,
        call_direction,
        caller_number,
        called_number,
        call_summary,
        call_outcome,
        job_type,
        severity,
        urgency,
        insurance_involvement,
        pipeline_action_taken,
        coaching_tips,
        estimated_job_value,
        job_potential_score,
        sentiment,
        created_at,
        processed_at
      `)
      .eq('thread_id', threadId)
      .order('call_timestamp', { ascending: false })

    if (callsError) {
      console.error('Error fetching calls:', callsError)
      return NextResponse.json(
        { error: 'Failed to fetch call history', details: callsError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      calls: calls || [],
      count: calls?.length || 0,
    })
  } catch (error: any) {
    console.error('Error in get call history:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}



















































