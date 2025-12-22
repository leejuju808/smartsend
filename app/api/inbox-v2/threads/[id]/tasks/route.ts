import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/inbox-v2/threads/[id]/tasks
 * Create or update tasks for a thread
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()
    const threadId = params.id

    const body = await req.json()
    const { action, title, due_date, priority } = body

    if (!action) {
      return NextResponse.json(
        { error: 'action is required' },
        { status: 400 }
      )
    }

    // Get thread
    const { data: thread } = await supabase
      .from('inbox_threads')
      .select('contact_id')
      .eq('id', threadId)
      .single()

    if (!thread) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      )
    }

    if (!thread.contact_id) {
      return NextResponse.json(
        { error: 'Thread has no associated contact' },
        { status: 400 }
      )
    }

    switch (action) {
      case 'create':
        if (!title) {
          return NextResponse.json(
            { error: 'title is required for create action' },
            { status: 400 }
          )
        }

        const { error: createError } = await supabase
          .from('tasks')
          .insert({
            workspace_id,
            contact_id: thread.contact_id,
            title,
            due_date: due_date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            priority: priority || 'medium',
            task_type: 'follow_up',
            created_at: new Date().toISOString(),
          })

        if (createError) {
          console.error('Error creating task:', createError)
          return NextResponse.json(
            { error: 'Failed to create task', details: createError.message },
            { status: 500 }
          )
        }
        break

      case 'mark_waiting':
        // Create a task indicating waiting on homeowner
        await supabase
          .from('tasks')
          .insert({
            workspace_id,
            contact_id: thread.contact_id,
            title: 'Waiting on homeowner response',
            due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            priority: 'low',
            task_type: 'follow_up',
            created_at: new Date().toISOString(),
          })
        break

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in POST /api/inbox-v2/threads/[id]/tasks:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}





















































