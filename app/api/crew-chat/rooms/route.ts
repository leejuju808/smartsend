// Block 253600 — SmartSend Crew Communication Suite v1
// API: Get and create chat rooms

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/crew-chat/rooms - Get rooms for user
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
    const room_type = searchParams.get('room_type')
    const job_id = searchParams.get('job_id')

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      )
    }

    // Build query
    let query = supabase
      .from('chat_rooms')
      .select(`
        *,
        chat_room_members!inner (
          id,
          employee_id,
          user_id,
          role
        ),
        jobs:job_id (
          id,
          stage,
          contract_value
        )
      `)
      .eq('company_id', company_id)

    if (room_type) {
      query = query.eq('room_type', room_type)
    }

    if (job_id) {
      query = query.eq('job_id', job_id)
    }

    // Filter to only rooms user is a member of
    query = query.or(
      `chat_room_members.employee_id.in.(SELECT id FROM workforce_employees WHERE email = '${user.email}'),chat_room_members.user_id.eq.${user.id}`
    )

    const { data: rooms, error } = await query.order('updated_at', {
      ascending: false,
    })

    if (error) {
      console.error('Error fetching rooms:', error)
      return NextResponse.json(
        { error: 'Failed to fetch rooms', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ rooms: rooms || [] }, { status: 200 })
  } catch (error: any) {
    console.error('Error in GET /api/crew-chat/rooms:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

// POST /api/crew-chat/rooms - Create a new room
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { company_id, room_type, job_id, name, description } = body

    if (!company_id || !room_type || !name) {
      return NextResponse.json(
        { error: 'company_id, room_type, and name are required' },
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

    if (company.owner_id !== user.id) {
      // Check if user is an employee
      const { data: employee } = await supabase
        .from('workforce_employees')
        .select('id, role')
        .eq('company_id', company_id)
        .eq('email', user.email)
        .single()

      if (!employee || !['project_manager', 'foreman'].includes(employee.role)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Create room
    const roomData: any = {
      company_id,
      room_type,
      name,
      description,
      created_by: user.id,
    }

    if (job_id) {
      roomData.job_id = job_id
    }

    const { data: newRoom, error: insertError } = await supabase
      .from('chat_rooms')
      .insert(roomData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating room:', insertError)
      return NextResponse.json(
        { error: 'Failed to create room', details: insertError.message },
        { status: 500 }
      )
    }

    // Add creator as admin member
    const { data: employee } = await supabase
      .from('workforce_employees')
      .select('id')
      .eq('company_id', company_id)
      .eq('email', user.email)
      .single()

    const memberData: any = {
      room_id: newRoom.id,
      role: 'admin',
      user_id: user.id,
    }

    if (employee?.id) {
      memberData.employee_id = employee.id
    }

    await supabase.from('chat_room_members').insert(memberData)

    return NextResponse.json({ room: newRoom }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/crew-chat/rooms:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
























