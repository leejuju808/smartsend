import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scanForRisks } from '@/lib/ai/owner-mode/risk-ai'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const workspaceId = req.nextUrl.searchParams.get('workspace_id')
    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspace_id' }, { status: 400 })
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    }

    // Get unacknowledged insights (risks)
    const { data: insights } = await supabase
      .from('ai_insights')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('acknowledged', false)
      .in('severity', ['warning', 'critical'])
      .order('created_at', { ascending: false })
      .limit(50)

    // Also scan for new risks
    const newRisks = await scanForRisks(workspaceId)

    return NextResponse.json({
      risks: insights || [],
      newRisks: newRisks,
      total: (insights?.length || 0) + newRisks.length,
    })
  } catch (error: any) {
    console.error('Risks error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to scan risks' },
      { status: 500 }
    )
  }
}

























