// Block 253600 — SmartSend Crew Communication Suite v1
// API: Get and manage supervisor alerts

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/crew-chat/alerts - Get alerts for company
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const company_id = searchParams.get('company_id')
    const resolved = searchParams.get('resolved')
    const alert_type = searchParams.get('alert_type')

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      )
    }

    // Verify user has access to company
    const { data: company } = await supabase
      .from('roofing_companies')
      .select('id, owner_id')
      .eq('id', company_id)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Check if user is owner or PM/Foreman
    const isOwner = company.owner_id === user.id
    const { data: employee } = await supabase
      .from('workforce_employees')
      .select('role')
      .eq('company_id', company_id)
      .eq('email', user.email)
      .single()

    const isSupervisor =
      isOwner ||
      (employee && ['project_manager', 'foreman'].includes(employee.role))

    if (!isSupervisor) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Build query
    let query = supabase
      .from('supervisor_alerts')
      .select(`
        *,
        jobs:job_id (
          id,
          stage,
          contract_value
        ),
        chat_rooms:room_id (
          id,
          name
        ),
        chat_messages:message_id (
          id,
          message,
          photo_url
        )
      `)
      .eq('company_id', company_id)

    if (resolved !== null) {
      query = query.eq('resolved', resolved === 'true')
    }

    if (alert_type) {
      query = query.eq('alert_type', alert_type)
    }

    const { data: alerts, error } = await query
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Error fetching alerts:', error)
      return NextResponse.json(
        { error: 'Failed to fetch alerts', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ alerts: alerts || [] }, { status: 200 })
  } catch (error: any) {
    console.error('Error in GET /api/crew-chat/alerts:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

// PATCH /api/crew-chat/alerts/[id] - Resolve an alert
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { alert_id, resolved, resolution_notes } = body

    if (!alert_id) {
      return NextResponse.json(
        { error: 'alert_id is required' },
        { status: 400 }
      )
    }

    // Get alert to verify access
    const { data: alert } = await supabase
      .from('supervisor_alerts')
      .select('company_id')
      .eq('id', alert_id)
      .single()

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }

    // Verify user has access
    const { data: company } = await supabase
      .from('roofing_companies')
      .select('id, owner_id')
      .eq('id', alert.company_id)
      .single()

    const isOwner = company?.owner_id === user.id
    const { data: employee } = await supabase
      .from('workforce_employees')
      .select('role')
      .eq('company_id', alert.company_id)
      .eq('email', user.email)
      .single()

    const isSupervisor =
      isOwner ||
      (employee && ['project_manager', 'foreman'].includes(employee.role))

    if (!isSupervisor) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Update alert
    const updateData: any = {
      resolved: resolved !== undefined ? resolved : true,
      resolved_at: resolved !== false ? new Date().toISOString() : null,
      resolved_by: resolved !== false ? user.id : null,
    }

    if (resolution_notes) {
      updateData.resolution_notes = resolution_notes
    }

    const { data: updatedAlert, error: updateError } = await supabase
      .from('supervisor_alerts')
      .update(updateData)
      .eq('id', alert_id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating alert:', updateError)
      return NextResponse.json(
        { error: 'Failed to update alert', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ alert: updatedAlert }, { status: 200 })
  } catch (error: any) {
    console.error('Error in PATCH /api/crew-chat/alerts:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
























