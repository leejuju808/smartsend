import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/inbox-v2/threads/[id]/appointments
 * Create an appointment for a thread
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
    const { time, date, notes } = body

    if (!time && !date) {
      return NextResponse.json(
        { error: 'time or date is required' },
        { status: 400 }
      )
    }

    // Get thread
    const { data: thread } = await supabase
      .from('inbox_threads')
      .select('contact_id, campaign_id')
      .eq('id', threadId)
      .single()

    if (!thread) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      )
    }

    // Create appointment record (assuming appointments table exists)
    // If not, we can create a task or calendar event instead
    const appointmentData: any = {
      thread_id: threadId,
      contact_id: thread.contact_id,
      campaign_id: thread.campaign_id,
      scheduled_time: time || date,
      notes: notes || null,
      created_at: new Date().toISOString(),
    }

    // Try to insert into appointments table, fallback to tasks
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert(appointmentData)
      .select()
      .single()

    if (appointmentError) {
      // Fallback: create as task
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          thread_id: threadId,
          contact_id: thread.contact_id,
          title: `Appointment: ${time || date}`,
          description: notes || `Appointment scheduled for ${time || date}`,
          due_date: time || date,
          type: 'appointment',
          status: 'scheduled',
        })
        .select()
        .single()

      if (taskError) {
        console.error('Error creating appointment/task:', taskError)
        return NextResponse.json(
          { error: 'Failed to create appointment', details: taskError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, task })
    }

    return NextResponse.json({ success: true, appointment })
  } catch (error: any) {
    console.error('Error creating appointment:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



















































