import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/inbox-v2/bulk
 * Perform bulk actions on threads
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()

    const body = await req.json()
    const { thread_ids, action } = body

    if (!thread_ids || !Array.isArray(thread_ids) || thread_ids.length === 0) {
      return NextResponse.json(
        { error: 'thread_ids array is required' },
        { status: 400 }
      )
    }

    if (!action) {
      return NextResponse.json(
        { error: 'action is required' },
        { status: 400 }
      )
    }

    let updateData: any = {}

    switch (action) {
      case 'mark_read':
        updateData = { unread_count: 0 }
        break
      case 'archive':
        updateData = { status: 'archived' }
        break
      case 'snooze':
        updateData = { status: 'snoozed' }
        break
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

    // Update threads
    const { error: updateError } = await supabase
      .from('inbox_threads')
      .update(updateData)
      .in('id', thread_ids)

    if (updateError) {
      console.error('Error updating threads:', updateError)
      return NextResponse.json(
        { error: 'Failed to update threads', details: updateError.message },
        { status: 500 }
      )
    }

    // Handle create_tasks action
    if (action === 'create_tasks') {
      // Get threads to create tasks for
      const { data: threads } = await supabase
        .from('inbox_threads')
        .select('id, contact_id')
        .in('id', thread_ids)

      if (threads) {
        // Create tasks for each thread
        const tasks = threads
          .filter(t => t.contact_id)
          .map(t => ({
            workspace_id,
            contact_id: t.contact_id,
            title: 'Follow up on conversation',
            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            priority: 'medium',
            task_type: 'follow_up',
            created_at: new Date().toISOString(),
          }))

        if (tasks.length > 0) {
          await supabase.from('tasks').insert(tasks)
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      updated_count: thread_ids.length 
    })
  } catch (error: any) {
    console.error('Error in POST /api/inbox-v2/bulk:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}





















































