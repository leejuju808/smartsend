import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateDailyBriefing } from '@/lib/ai/owner-mode/daily-briefing'

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

    // Check if briefing exists for today
    const today = new Date().toISOString().split('T')[0]
    const { data: existingBriefing } = await supabase
      .from('ai_daily_briefings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('briefing_date', today)
      .single()

    if (existingBriefing) {
      return NextResponse.json({
        briefing: existingBriefing.content,
        metrics: existingBriefing.metrics,
        date: existingBriefing.briefing_date,
      })
    }

    // Generate new briefing
    const briefing = await generateDailyBriefing(workspaceId)

    const { data: savedBriefing } = await supabase
      .from('ai_daily_briefings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('briefing_date', today)
      .single()

    return NextResponse.json({
      briefing: savedBriefing?.content || briefing,
      metrics: savedBriefing?.metrics || {},
      date: today,
    })
  } catch (error: any) {
    console.error('Briefing error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate briefing' },
      { status: 500 }
    )
  }
}

























