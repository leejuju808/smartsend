import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/inbox-v2/ai-assist
 * Get AI-assisted reply suggestions
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()

    const body = await req.json()
    const { thread_id, draft } = body

    if (!thread_id || !draft) {
      return NextResponse.json(
        { error: 'thread_id and draft are required' },
        { status: 400 }
      )
    }

    // Get thread context
    const { data: thread } = await supabase
      .from('inbox_threads')
      .select('*, contacts:contact_id (*)')
      .eq('id', thread_id)
      .single()

    if (!thread) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      )
    }

    // Get latest AI analysis for context
    const { data: analysis } = await supabase
      .from('ai_reply_analysis')
      .select('*')
      .eq('thread_id', thread_id)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single()

    // Call OpenAI to improve the draft
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const context = analysis ? `
Context from previous analysis:
- Intent: ${analysis.intent_type}
- Tone: ${analysis.emotional_tone}
- Urgency: ${analysis.urgency_level}
- Questions: ${JSON.stringify(analysis.extracted_questions)}
` : ''

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a professional roofing contractor communication assistant. Improve the draft reply to be:
- Professional and friendly
- Clear and concise
- Addresses homeowner questions/concerns
- Includes next steps when appropriate
- Maintains the original intent and tone

${context}

Return only the improved draft text, no explanations.`,
          },
          {
            role: 'user',
            content: `Improve this draft reply:\n\n${draft}`,
          },
        ],
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()
    const improvedDraft = data.choices[0].message.content.trim()

    return NextResponse.json({
      suggested_reply: improvedDraft,
    })
  } catch (error: any) {
    console.error('Error in POST /api/inbox-v2/ai-assist:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}





















































