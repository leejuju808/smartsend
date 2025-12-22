import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MasterAIBrain } from '@/lib/ai/master-ai-brain'

/**
 * POST /api/masterai/state/update
 * Update global state (triggers full context refresh)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { workspace_id } = body

    if (!workspace_id) {
      return NextResponse.json(
        { error: 'Missing workspace_id' },
        { status: 400 }
      )
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    }

    // Update global context
    const brain = new MasterAIBrain(workspace_id)
    await brain.updateGlobalContext()

    return NextResponse.json({ success: true, message: 'Global state updated' })
  } catch (error: any) {
    console.error('State update error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update state' },
      { status: 500 }
    )
  }
}

























