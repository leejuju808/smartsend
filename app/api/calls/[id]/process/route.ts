import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processCallIntelligence } from '../process-utils'

/**
 * POST /api/calls/[id]/process
 * Manually trigger AI processing for a call transcript
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const callId = params.id

    // Get call transcript
    const { data: call, error: callError } = await supabase
      .from('call_transcripts')
      .select('id, workspace_id, transcription')
      .eq('id', callId)
      .single()

    if (callError || !call) {
      return NextResponse.json({ error: 'Call transcript not found' }, { status: 404 })
    }

    // Verify workspace access
    const { data: workspace } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', call.workspace_id)
      .eq('user_id', user.id)
      .single()

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    }

    // Trigger processing asynchronously
    processCallIntelligence(callId).catch((error) => {
      console.error('Error processing call intelligence:', error)
    })

    return NextResponse.json({
      success: true,
      message: 'AI processing started for call transcript',
      call_id: callId,
    })
  } catch (error: any) {
    console.error('Error in process call:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

