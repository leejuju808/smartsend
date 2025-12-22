import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { status } = await req.json()
    
    if (!status || !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be one of: open, in_progress, resolved, closed' },
        { status: 400 }
      )
    }

    // Get thread info for activity log
    const { data: thread } = await supabase
      .from("reply_threads")
      .select("account_id, campaign_id, lead_id, status")
      .eq("id", params.id)
      .single();

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Update status
    const { error: updateError } = await supabase
      .from("reply_threads")
      .update({ status })
      .eq("id", params.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    // Log event
    await supabase.from("activity_log").insert({
      event_type: "status_change",
      account_id: thread.account_id,
      campaign_id: thread.campaign_id,
      lead_id: thread.lead_id,
      meta: { thread_id: params.id, status, previous_status: thread.status }
    })
    
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error updating thread status:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

