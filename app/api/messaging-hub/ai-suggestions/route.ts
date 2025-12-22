import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/messaging-hub/ai-suggestions
 * Generate AI reply suggestions for a message
 * 
 * Suggestion types:
 * - short_reply: Quick, brief response
 * - long_reply: Detailed, comprehensive response
 * - tone_matched: Matches the tone of the incoming message
 * - scheduling: Scheduling-focused response
 * - insurance_explanation: Insurance process explanation
 * - deposit_reminder: Deposit reminder message
 * - quote_followup: Quote follow-up message
 * - objection_handling: Handle objections
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()

    const body = await req.json()
    const { message_id, suggestion_types = ['short_reply'] } = body

    if (!message_id) {
      return NextResponse.json(
        { error: 'message_id is required' },
        { status: 400 }
      )
    }

    // Get the message
    const { data: message, error: messageError } = await supabase
      .from('unified_messages')
      .select(`
        *,
        contacts:contact_id (
          id,
          name,
          email,
          first_name,
          last_name
        ),
        leads:lead_id (
          id,
          name,
          email,
          status
        ),
        roofing_jobs:job_id (
          id,
          title,
          status,
          current_stage
        )
      `)
      .eq('id', message_id)
      .eq('workspace_id', workspace_id)
      .single()

    if (messageError || !message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    // Generate AI suggestions using OpenAI
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const contactName = message.contacts?.first_name || message.contacts?.name || 'there'
    const messageBody = message.body_text || message.body_html || ''
    const messageSubject = message.subject || ''
    const jobStage = message.roofing_jobs?.current_stage || message.leads?.status || 'unknown'

    const suggestions = []

    for (const suggestionType of suggestion_types) {
      let prompt = ''

      switch (suggestionType) {
        case 'short_reply':
          prompt = `You are a roofing company representative. A homeowner named ${contactName} sent this message: "${messageBody}". Generate a brief, friendly, professional reply (2-3 sentences max). Be helpful and action-oriented.`
          break

        case 'long_reply':
          prompt = `You are a roofing company representative. A homeowner named ${contactName} sent this message: "${messageBody}". Generate a comprehensive, detailed reply that addresses all their concerns and provides helpful information.`
          break

        case 'tone_matched':
          prompt = `You are a roofing company representative. A homeowner named ${contactName} sent this message: "${messageBody}". Match their tone (formal/casual) and generate an appropriate reply.`
          break

        case 'scheduling':
          prompt = `You are a roofing company representative. A homeowner named ${contactName} wants to schedule something. Their message: "${messageBody}". Generate a friendly scheduling response offering specific times (e.g., "10 AM or 2 PM").`
          break

        case 'insurance_explanation':
          prompt = `You are a roofing company representative helping with insurance claims. A homeowner named ${contactName} asked about insurance. Their message: "${messageBody}". Explain the insurance process clearly and offer to help.`
          break

        case 'deposit_reminder':
          prompt = `You are a roofing company representative. Remind ${contactName} about their deposit in a friendly, professional way. Reference their project if available.`
          break

        case 'quote_followup':
          prompt = `You are a roofing company representative following up on a quote. A homeowner named ${contactName} received a quote. Their message: "${messageBody}". Generate a follow-up that's helpful but not pushy.`
          break

        case 'objection_handling':
          prompt = `You are a roofing company representative. A homeowner named ${contactName} raised an objection: "${messageBody}". Address their concern empathetically and provide reassurance.`
          break

        default:
          continue
      }

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful roofing company representative. Be professional, friendly, and focused on helping homeowners.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 500,
            temperature: 0.7
          })
        })

        if (!response.ok) {
          console.error('OpenAI API error:', await response.text())
          continue
        }

        const data = await response.json()
        const suggestedText = data.choices[0]?.message?.content || ''

        if (suggestedText) {
          // Save suggestion to database
          const { data: suggestion, error: suggestionError } = await supabase
            .from('ai_message_suggestions')
            .insert({
              workspace_id,
              message_id,
              suggestion_type: suggestionType,
              suggested_text: suggestedText,
              ai_model: 'gpt-4o-mini',
              ai_tokens_used: data.usage?.total_tokens || 0,
              ai_confidence: 0.85
            })
            .select()
            .single()

          if (!suggestionError && suggestion) {
            suggestions.push(suggestion)
          }
        }
      } catch (error) {
        console.error(`Error generating ${suggestionType} suggestion:`, error)
        // Continue with other suggestion types
      }
    }

    return NextResponse.json({
      suggestions,
      message_id
    })
  } catch (error) {
    console.error('Error in POST /api/messaging-hub/ai-suggestions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






































