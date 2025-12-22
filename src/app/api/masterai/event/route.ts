import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/masterai/event
 * Trigger AI event update
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const {
      workspace_id,
      event_type,
      event_category,
      payload,
      related_lead_id,
      related_job_id,
      related_crew_id,
      importance_score
    } = body

    if (!workspace_id || !event_type || !event_category) {
      return NextResponse.json(
        { error: 'Missing required fields: workspace_id, event_type, event_category' },
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

    // Get company_id if exists
    let company_id = null
    const { data: company } = await supabase
      .from('roofing_companies')
      .select('id')
      .eq('workspace_id', workspace_id)
      .single()
    
    if (company) {
      company_id = company.id
    }

    // Insert event
    const { data: event, error } = await supabase
      .from('ai_event_stream')
      .insert({
        workspace_id,
        company_id,
        event_type,
        event_category,
        payload: payload || {},
        related_lead_id,
        related_job_id,
        related_crew_id,
        importance_score: importance_score || 0.5
      })
      .select()
      .single()

    if (error) {
      console.error('Event insertion error:', error)
      return NextResponse.json(
        { error: 'Failed to log event' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, event_id: event.id })
  } catch (error: any) {
    console.error('Event logging error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to log event' },
      { status: 500 }
    )
  }
}

























