import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MasterAIBrain } from '@/lib/ai/master-ai-brain'

/**
 * GET /api/masterai/health
 * Get company health score
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const workspace_id = searchParams.get('workspace_id')

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

    // Calculate health score
    const brain = new MasterAIBrain(workspace_id)
    const health = await brain.calculateHealthScore()

    return NextResponse.json(health)
  } catch (error: any) {
    console.error('Health score error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to calculate health score' },
      { status: 500 }
    )
  }
}

























