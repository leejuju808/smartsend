// Block 20000 — AI Voice Draft Correction API
// Improves transcribed voice messages with AI

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
    const { transcript, thread_id } = await req.json()

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json(
        { error: 'Transcript is required' },
        { status: 400 }
      )
    }

    // Get thread context if thread_id provided
    let threadContext = ''
    if (thread_id) {
      try {
        const { data: thread } = await supabase
          .from('inbox_threads')
          .select(`
            id,
            snippet,
            latest_intent,
            contacts:lead_id (
              first_name,
              last_name,
              city,
              state
            )
          `)
          .eq('id', thread_id)
          .single()

        if (thread) {
          threadContext = `Thread context: ${thread.snippet || 'No previous messages'}. Lead: ${thread.contacts?.first_name || ''} ${thread.contacts?.last_name || ''} in ${thread.contacts?.city || ''}, ${thread.contacts?.state || ''}. Intent: ${thread.latest_intent || 'unknown'}.`
        }
      } catch (error) {
        console.error('Error fetching thread context:', error)
        // Continue without context
      }
    }

    // Improve transcript with AI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional communication assistant for roofing contractors. Your job is to improve voice transcripts to make them sound professional, clear, and appropriate for customer communication.

Rules:
1. Fix grammar and spelling errors
2. Make the message clearer and more concise
3. Add missing context if needed
4. Match professional but friendly tone
5. Adjust for roofing industry context
6. Keep the original meaning and intent
7. Remove filler words and stutters
8. Make it sound natural, not robotic

${threadContext ? `Context: ${threadContext}` : ''}

Return ONLY the improved transcript, nothing else.`,
        },
        {
          role: 'user',
          content: `Improve this voice transcript for a roofing professional:\n\n"${transcript}"`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const improvedTranscript =
      completion.choices[0]?.message?.content?.trim() || transcript

    return NextResponse.json({
      improved_transcript: improvedTranscript,
      original_transcript: transcript,
    })
  } catch (error: any) {
    console.error('Improvement error:', error)
    return NextResponse.json(
      { error: error.message || 'Improvement failed' },
      { status: 500 }
    )
  }
}

