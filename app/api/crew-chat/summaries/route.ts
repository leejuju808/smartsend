// Block 253600 — SmartSend Crew Communication Suite v1
// API: Generate AI summaries of chat conversations

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// POST /api/crew-chat/summaries - Generate summary for a room
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
    const { room_id, summary_type = 'daily' } = body

    if (!room_id) {
      return NextResponse.json(
        { error: 'room_id is required' },
        { status: 400 }
      )
    }

    // Verify user has access to this room
    const { data: membership } = await supabase
      .from('chat_room_members')
      .select('*')
      .eq('room_id', room_id)
      .or(`employee_id.in.(SELECT id FROM workforce_employees WHERE email = '${user.email}'),user_id.eq.${user.id}`)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get room info
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', room_id)
      .single()

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    // Determine time range
    let start_time: Date
    let end_time = new Date()

    if (summary_type === 'daily') {
      start_time = new Date()
      start_time.setHours(0, 0, 0, 0)
    } else {
      // For thread summaries, get all messages
      start_time = new Date(0) // Beginning of time
    }

    // Get messages in time range
    const { data: messages } = await supabase
      .from('chat_messages')
      .select(`
        *,
        workforce_employees:employee_id (
          first_name,
          last_name,
          role
        )
      `)
      .eq('room_id', room_id)
      .gte('created_at', start_time.toISOString())
      .lte('created_at', end_time.toISOString())
      .order('created_at', { ascending: true })

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'No messages found in time range' },
        { status: 400 }
      )
    }

    // Format messages for AI
    const messagesText = messages
      .map((msg) => {
        const sender =
          msg.workforce_employees?.first_name ||
          'Unknown'
        const role = msg.workforce_employees?.role || 'member'
        const content = msg.ai_photo_note || msg.ai_transcription || msg.message
        return `[${role}] ${sender}: ${content}`
      })
      .join('\n')

    // Generate summary with AI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are SmartSend AI Summary Engine. Generate concise, actionable summaries of roofing crew conversations.

Format your response as JSON with this structure:
{
  "summary": "Main summary text (2-3 sentences)",
  "key_points": ["point 1", "point 2", "point 3"],
  "action_items": ["action 1", "action 2"],
  "status": "on_track" | "needs_attention" | "delayed" | "completed"
}

Focus on:
- Installation progress
- Issues or problems reported
- Material status
- Safety concerns
- Next steps needed
- Completion estimates`,
        },
        {
          role: 'user',
          content: `Summarize this roofing crew conversation:\n\n${messagesText}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
      temperature: 0.3,
    })

    const summaryData = JSON.parse(
      response.choices[0]?.message?.content || '{}'
    )

    // Extract key points and action items
    const key_points = summaryData.key_points || []
    const action_items = summaryData.action_items || []

    // Save summary
    const { data: summary, error: insertError } = await supabase
      .from('chat_room_summaries')
      .insert({
        room_id,
        summary_text: summaryData.summary || '',
        summary_type,
        start_time: start_time.toISOString(),
        end_time: end_time.toISOString(),
        message_count: messages.length,
        key_points: key_points,
        action_items: action_items,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error saving summary:', insertError)
      return NextResponse.json(
        { error: 'Failed to save summary', details: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ summary }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/crew-chat/summaries:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

// GET /api/crew-chat/summaries - Get summaries for a room
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
    const room_id = searchParams.get('room_id')

    if (!room_id) {
      return NextResponse.json(
        { error: 'room_id is required' },
        { status: 400 }
      )
    }

    // Verify user has access to this room
    const { data: membership } = await supabase
      .from('chat_room_members')
      .select('*')
      .eq('room_id', room_id)
      .or(`employee_id.in.(SELECT id FROM workforce_employees WHERE email = '${user.email}'),user_id.eq.${user.id}`)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get summaries
    const { data: summaries, error } = await supabase
      .from('chat_room_summaries')
      .select('*')
      .eq('room_id', room_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching summaries:', error)
      return NextResponse.json(
        { error: 'Failed to fetch summaries', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ summaries: summaries || [] }, { status: 200 })
  } catch (error: any) {
    console.error('Error in GET /api/crew-chat/summaries:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
























