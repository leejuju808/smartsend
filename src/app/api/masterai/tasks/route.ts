import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/masterai/tasks
 * Get AI-generated tasks
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
    const status = searchParams.get('status') || 'open'
    const priority = searchParams.get('priority')
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '50')

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

    // Build query
    let query = supabase
      .from('ai_tasks')
      .select('*')
      .eq('workspace_id', workspace_id)
      .eq('status', status)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (priority) {
      query = query.eq('priority', priority)
    }

    if (category) {
      query = query.eq('category', category)
    }

    const { data: tasks, error } = await query

    if (error) {
      console.error('Tasks fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch tasks' },
        { status: 500 }
      )
    }

    return NextResponse.json({ tasks: tasks || [] })
  } catch (error: any) {
    console.error('Tasks error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get tasks' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/masterai/tasks
 * Update task status (complete, dismiss, etc.)
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { task_id, status, workspace_id } = body

    if (!task_id || !status || !workspace_id) {
      return NextResponse.json(
        { error: 'Missing required fields: task_id, status, workspace_id' },
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

    // Update task
    const updateData: any = { status }
    
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString()
    } else if (status === 'dismissed') {
      updateData.dismissed_at = new Date().toISOString()
    }

    const { data: task, error } = await supabase
      .from('ai_tasks')
      .update(updateData)
      .eq('id', task_id)
      .eq('workspace_id', workspace_id)
      .select()
      .single()

    if (error) {
      console.error('Task update error:', error)
      return NextResponse.json(
        { error: 'Failed to update task' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, task })
  } catch (error: any) {
    console.error('Task update error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update task' },
      { status: 500 }
    )
  }
}

























