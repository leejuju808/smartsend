import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MasterAIBrain } from '@/lib/ai/master-ai-brain'

/**
 * POST /api/masterai/query
 * Ask the AI anything about the company
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { question, workspace_id } = body

    if (!question || !workspace_id) {
      return NextResponse.json(
        { error: 'Missing question or workspace_id' },
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

    // Query the Master AI Brain
    const brain = new MasterAIBrain(workspace_id)
    const result = await brain.query(question)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Master AI query error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process query' },
      { status: 500 }
    )
  }
}

























