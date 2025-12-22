// Block 253600 — SmartSend Crew Communication Suite v1
// API: Search chat messages

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/crew-chat/search - Search messages
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
    const query = searchParams.get('q')
    const company_id = searchParams.get('company_id')
    const room_id = searchParams.get('room_id')
    const job_id = searchParams.get('job_id')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!query) {
      return NextResponse.json(
        { error: 'Search query (q) is required' },
        { status: 400 }
      )
    }

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      )
    }

    // Verify user has access to company
    const { data: company } = await supabase
      .from('roofing_companies')
      .select('id')
      .eq('id', company_id)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Build search query
    let searchQuery = supabase
      .from('chat_messages')
      .select(`
        *,
        chat_rooms!inner (
          id,
          name,
          room_type,
          company_id,
          job_id
        ),
        workforce_employees:employee_id (
          id,
          first_name,
          last_name,
          role
        )
      `)
      .textSearch('message', query, {
        type: 'websearch',
        config: 'english',
      })
      .eq('chat_rooms.company_id', company_id)
      .limit(limit)

    if (room_id) {
      searchQuery = searchQuery.eq('room_id', room_id)
    }

    if (job_id) {
      searchQuery = searchQuery.eq('chat_rooms.job_id', job_id)
    }

    // Filter to only rooms user has access to
    // Get user's room memberships
    const { data: memberships } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .or(`employee_id.in.(SELECT id FROM workforce_employees WHERE email = '${user.email}'),user_id.eq.${user.id}`)

    const roomIds = memberships?.map((m) => m.room_id) || []

    if (roomIds.length === 0) {
      return NextResponse.json({ messages: [] }, { status: 200 })
    }

    searchQuery = searchQuery.in('room_id', roomIds)

    const { data: messages, error } = await searchQuery.order('created_at', {
      ascending: false,
    })

    if (error) {
      console.error('Error searching messages:', error)
      return NextResponse.json(
        { error: 'Failed to search messages', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ messages: messages || [] }, { status: 200 })
  } catch (error: any) {
    console.error('Error in GET /api/crew-chat/search:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
























