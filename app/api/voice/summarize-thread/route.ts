// Block 20000 — Voice Thread Summary API
// Generates a spoken summary of the thread

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { thread_id } = await req.json()

    if (!thread_id) {
      return NextResponse.json(
        { error: 'Thread ID is required' },
        { status: 400 }
      )
    }

    // Get thread with messages
    const { data: thread, error: threadError } = await supabase
      .from('inbox_threads')
      .select(`
        id,
        snippet,
        latest_intent,
        thread_estimated_value,
        pipeline_stage,
        last_message_at,
        contacts:lead_id (
          first_name,
          last_name,
          city,
          state,
          phone,
          email
        ),
        messages:inbox_messages (
          id,
          direction,
          body_text,
          sent_at
        )
      `)
      .eq('id', thread_id)
      .single()

    if (threadError || !thread) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      )
    }

    const messages = (thread.messages || []).sort(
      (a: any, b: any) =>
        new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
    )

    const conversation = messages
      .map((msg: any) => `${msg.direction === 'in' ? 'Homeowner' : 'You'}: ${msg.body_text}`)
      .join('\n\n')

    // Generate summary
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are summarizing a roofing lead conversation for a contractor who is on a roof and needs a quick briefing. Generate a concise, spoken summary that covers:

1. Job type and severity
2. What the homeowner said
3. Missing items or questions
4. Next best action
5. Appointment status
6. Estimated value (if available)

Keep it under 100 words. Write it as if you're speaking directly to the contractor.`,
        },
        {
          role: 'user',
          content: `Summarize this conversation:

Lead: ${thread.contacts?.first_name || ''} ${thread.contacts?.last_name || ''} in ${thread.contacts?.city || ''}, ${thread.contacts?.state || ''}
Intent: ${thread.latest_intent || 'unknown'}
Pipeline: ${thread.pipeline_stage || 'new_lead'}
Estimated Value: ${thread.thread_estimated_value ? `$${thread.thread_estimated_value}` : 'Not set'}

Conversation:
${conversation || 'No messages yet'}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    })

    const summary = completion.choices[0]?.message?.content?.trim() || ''

    return NextResponse.json({
      summary,
      thread_id,
      contact_name: `${thread.contacts?.first_name || ''} ${thread.contacts?.last_name || ''}`.trim(),
      estimated_value: thread.thread_estimated_value,
      pipeline_stage: thread.pipeline_stage,
      intent: thread.latest_intent,
    })
  } catch (error: any) {
    console.error('Thread summary error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate summary' },
      { status: 500 }
    )
  }
}



















































