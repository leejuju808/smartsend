// Inbox Analyze Reply Worker
// Automatically analyzes new messages and creates AI analysis records

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { thread_id, message_id, contact_id, workspace_id, text, subject } = await req.json()

    if (!thread_id || !text || !workspace_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Call OpenAI for analysis
    const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `You are SmartSend AI Reply Brain v2 - a comprehensive roofing communication intelligence system.

Analyze homeowner replies and extract:
1. Intent type (yes_wants_estimate, yes_come_inspect, insurance_claim_active, has_question, etc.)
2. Emotional tone (neutral, curious, urgent, etc.)
3. Questions asked
4. Insurance intent (keywords, confidence)
5. Booking intent (confidence)
6. Storm damage (keywords, urgency score)
7. Objections
8. Suggested actions and pipeline stage

Return JSON with this structure:
{
  "category": "yes_come_inspect",
  "confidence": 0.95,
  "emotionalTone": "urgent",
  "toneConfidence": 0.92,
  "extractedQuestions": [{"question": "When are you available?", "type": "availability"}],
  "hasInsuranceIntent": false,
  "insuranceKeywords": [],
  "insuranceConfidence": 0.0,
  "hasBookingIntent": true,
  "bookingConfidence": 0.95,
  "hasUrgentDamage": true,
  "damageKeywords": ["leaking", "water"],
  "urgencyScore": 0.97,
  "hasObjection": false,
  "objectionType": null,
  "objectionText": null,
  "suggestedActions": [{"action": "Offer inspection availability", "priority": 10, "reasoning": "Urgent damage + booking intent"}],
  "suggestedReplyTemplates": ["urgent-inspection-offer"],
  "suggestedPipelineStage": "HOT",
  "suggestedTags": ["urgent-damage", "ready-to-book"],
  "reasoning": "Homeowner has urgent roof damage and wants inspection immediately"
}`,
          },
          {
            role: 'user',
            content: `Analyze this homeowner reply:\n\nSubject: ${subject || '(none)'}\n\nBody: ${text}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    })

    if (!analysisResponse.ok) {
      throw new Error(`OpenAI API error: ${analysisResponse.statusText}`)
    }

    const analysisData = await analysisResponse.json()
    const analysis = JSON.parse(analysisData.choices[0].message.content)

    // Create AI analysis record
    const { data: analysisRecord, error: insertError } = await supabase
      .from('ai_reply_analysis')
      .insert({
        thread_id,
        message_id,
        contact_id,
        workspace_id,
        intent_type: analysis.category,
        intent_confidence: analysis.confidence,
        emotional_tone: analysis.emotionalTone,
        tone_confidence: analysis.toneConfidence,
        urgency_level: analysis.urgencyScore > 0.7 ? 'high' : analysis.urgencyScore > 0.4 ? 'medium' : 'low',
        extracted_questions: analysis.extractedQuestions || [],
        has_insurance_intent: analysis.hasInsuranceIntent || false,
        insurance_keywords: analysis.insuranceKeywords || [],
        insurance_confidence: analysis.insuranceConfidence || 0,
        has_booking_intent: analysis.hasBookingIntent || false,
        booking_confidence: analysis.bookingConfidence || 0,
        has_storm_damage: analysis.hasUrgentDamage || false,
        storm_keywords: analysis.damageKeywords || [],
        urgency_score: analysis.urgencyScore || 0,
        has_objection: analysis.hasObjection || false,
        objection_type: analysis.objectionType || null,
        objection_text: analysis.objectionText || null,
        suggested_actions: analysis.suggestedActions || [],
        suggested_reply_templates: analysis.suggestedReplyTemplates || [],
        suggested_pipeline_stage: analysis.suggestedPipelineStage || null,
        suggested_tags: analysis.suggestedTags || [],
        reasoning: analysis.reasoning || null,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating analysis:', insertError)
      throw insertError
    }

    // Create suggestions
    const suggestions: any = {
      suggested_replies: (analysis.suggestedActions || [])
        .slice(0, 3)
        .map((action: any, i: number) => ({
          text: action.action,
          type: 'suggested',
          confidence: 0.8 - i * 0.1,
        })),
      booking_suggestions: analysis.hasBookingIntent ? [
        { time: '2:00 PM', date: new Date().toISOString().split('T')[0], type: 'inspection' },
        { time: '10:30 AM', date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], type: 'inspection' },
      ] : [],
      insurance_actions: analysis.hasInsuranceIntent ? [
        { action: 'adjuster_prep', template: 'insurance_adjuster_prep' },
        { action: 'insurance_help', template: 'insurance_help_message' },
      ] : [],
      storm_actions: analysis.hasUrgentDamage ? [
        { action: 'emergency_message', template: 'storm_emergency', urgency: analysis.urgencyScore > 0.7 ? 'high' : 'medium' },
        { action: 'urgent_booking', template: 'storm_urgent_booking', urgency: 'high' },
      ] : [],
    }

    await supabase
      .from('inbox_suggestions')
      .upsert({
        thread_id,
        contact_id,
        workspace_id,
        ...suggestions,
      }, {
        onConflict: 'thread_id',
      })

    // Update thread metadata
    await supabase.rpc('update_thread_from_analysis', {
      p_thread_id: thread_id,
      p_analysis_id: analysisRecord.id,
    })

    return new Response(
      JSON.stringify({ success: true, analysis: analysisRecord }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Error in inbox-analyze-reply:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})





















































