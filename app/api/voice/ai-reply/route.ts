// Block 20000 — AI-Generated Voice Replies API
// Generates quick voice replies that can be spoken back

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
    const { thread_id, reply_type } = await req.json()

    if (!thread_id) {
      return NextResponse.json(
        { error: 'Thread ID is required' },
        { status: 400 }
      )
    }

    // Get thread context
    const { data: thread, error: threadError } = await supabase
      .from('inbox_threads')
      .select(`
        id,
        snippet,
        latest_intent,
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

    // Get last few messages for context
    const recentMessages = (thread.messages || [])
      .sort((a: any, b: any) => 
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
      )
      .slice(0, 5)
      .reverse()

    const conversationContext = recentMessages
      .map((msg: any) => 
        `${msg.direction === 'in' ? 'Homeowner' : 'You'}: ${msg.body_text}`
      )
      .join('\n')

    // Generate reply based on type
    const replyTypes: Record<string, string> = {
      quick_response: 'Generate a quick, professional response (1-2 sentences)',
      next_steps: 'Suggest next steps for this roofing lead',
      scheduling: 'Ask about scheduling an estimate',
      insurance_help: 'Offer help with insurance claim',
      photo_request: 'Request photos of the damage',
      follow_up: 'Create a friendly follow-up message',
    }

    const systemPrompt = `You are a professional roofing contractor assistant. Generate a clear, professional message that can be sent as text to a homeowner.

Context:
- Lead: ${thread.contacts?.first_name || ''} ${thread.contacts?.last_name || ''} in ${thread.contacts?.city || ''}, ${thread.contacts?.state || ''}
- Intent: ${thread.latest_intent || 'unknown'}
- Recent conversation:
${conversationContext || 'No previous messages'}

Generate a ${replyTypes[reply_type] || 'professional response'} that:
1. Is clear and concise
2. Sounds professional but friendly
3. Is appropriate for roofing industry
4. Can be sent directly as SMS or email
5. Is 1-3 sentences maximum

Return ONLY the message text, nothing else.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Generate a ${reply_type || 'quick response'} message.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    })

    const reply = completion.choices[0]?.message?.content?.trim() || ''

    return NextResponse.json({
      reply,
      reply_type: reply_type || 'quick_response',
    })
  } catch (error: any) {
    console.error('AI reply generation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate reply' },
      { status: 500 }
    )
  }
}



















































