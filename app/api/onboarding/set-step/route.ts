import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { stepId, workspaceId } = await req.json()

    if (!stepId) {
      return NextResponse.json({ error: 'stepId is required' }, { status: 400 })
    }

    // Get workspace_id if not provided
    let wsId = workspaceId
    if (!wsId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      
      wsId = membership?.workspace_id
    }

    if (!wsId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 400 })
    }

    // Mark step as done using RPC
    const { error: rpcError } = await supabase.rpc('mark_onboarding_step_done', {
      p_user_id: user.id,
      p_workspace_id: wsId,
      p_step_id: stepId,
    })

    if (rpcError) {
      console.error('Error marking step done:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, stepId })
  } catch (error: any) {
    console.error('Error in set-step:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}









