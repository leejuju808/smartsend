import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const workspaceId = req.nextUrl.searchParams.get('workspace_id')
    const category = req.nextUrl.searchParams.get('category')
    const severity = req.nextUrl.searchParams.get('severity')
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')

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

    // Build query
    let query = supabase
      .from('ai_insights')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (category) {
      query = query.eq('category', category)
    }

    if (severity) {
      query = query.eq('severity', severity)
    }

    const { data: insights } = await query

    return NextResponse.json({
      insights: insights || [],
      count: insights?.length || 0,
    })
  } catch (error: any) {
    console.error('Insights error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch insights' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { insight_id, acknowledged } = body

    if (!insight_id) {
      return NextResponse.json({ error: 'Missing insight_id' }, { status: 400 })
    }

    // Update insight acknowledgment
    const { data: insight } = await supabase
      .from('ai_insights')
      .select('workspace_id')
      .eq('id', insight_id)
      .single()

    if (!insight) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 })
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', insight.workspace_id)
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    }

    // Update acknowledgment
    const updateData: any = {
      acknowledged: acknowledged !== false,
    }

    if (acknowledged !== false) {
      updateData.acknowledged_at = new Date().toISOString()
      updateData.acknowledged_by = user.id
    } else {
      updateData.acknowledged_at = null
      updateData.acknowledged_by = null
    }

    const { data: updated } = await supabase
      .from('ai_insights')
      .update(updateData)
      .eq('id', insight_id)
      .select()
      .single()

    return NextResponse.json({ insight: updated })
  } catch (error: any) {
    console.error('Insight update error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update insight' },
      { status: 500 }
    )
  }
}

























