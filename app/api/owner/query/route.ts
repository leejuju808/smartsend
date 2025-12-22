import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { answerCompanyQuestion } from '@/lib/ai/owner-mode/company-ai'

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

    // Answer the question
    const result = await answerCompanyQuestion(workspace_id, user.id, question)

    return NextResponse.json({
      answer: result.answer,
      context: result.contextData,
    })
  } catch (error: any) {
    console.error('Owner query error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process query' },
      { status: 500 }
    )
  }
}

























