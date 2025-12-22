import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MasterAIBrain } from '@/lib/ai/master-ai-brain'

/**
 * GET /api/masterai/recommendations
 * Get AI recommendations
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
    const limit = parseInt(searchParams.get('limit') || '20')

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

    // Get recommendations
    const brain = new MasterAIBrain(workspace_id)
    const recommendations = await brain.getRecommendations(limit)

    return NextResponse.json({ recommendations })
  } catch (error: any) {
    console.error('Recommendations error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get recommendations' },
      { status: 500 }
    )
  }
}

























