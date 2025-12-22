import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateForecast } from '@/lib/ai/owner-mode/forecast-ai'

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

    // Generate forecast
    const forecast = await generateForecast(workspaceId)

    return NextResponse.json(forecast)
  } catch (error: any) {
    console.error('Forecast error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate forecast' },
      { status: 500 }
    )
  }
}

























