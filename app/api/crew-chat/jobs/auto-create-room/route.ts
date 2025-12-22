// Block 253600 — SmartSend Crew Communication Suite v1
// API: Auto-create job chat room when job is created

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/crew-chat/jobs/auto-create-room - Create chat room for a job
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
    const { job_id, company_id, job_name } = body

    if (!job_id || !company_id) {
      return NextResponse.json(
        { error: 'job_id and company_id are required' },
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

    // Call database function to ensure room exists
    const { data: roomId, error } = await supabase.rpc('ensure_job_chat_room', {
      p_job_id: job_id,
      p_company_id: company_id,
      p_job_name: job_name || null,
    })

    if (error) {
      console.error('Error creating job chat room:', error)
      return NextResponse.json(
        { error: 'Failed to create job chat room', details: error.message },
        { status: 500 }
      )
    }

    // Get the created room
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    return NextResponse.json({ room }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/crew-chat/jobs/auto-create-room:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
























