import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'
import { analyzeReplyIntelligence } from '@/src/lib/ai/replyBrainV2'

/**
 * POST /api/inbox-v2/analyze
 * Analyze a message and create AI analysis record
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()

    const body = await req.json()
    const { thread_id, message_id, contact_id, text, subject } = body

    if (!thread_id || !text) {
      return NextResponse.json(
        { error: 'thread_id and text are required' },
        { status: 400 }
      )
    }

    // Analyze using Reply Brain v2
    const analysis = await analyzeReplyIntelligence(text, subject)

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
      return NextResponse.json(
        { error: 'Failed to create analysis', details: insertError.message },
        { status: 500 }
      )
    }

    // Create suggestions
    const suggestions: any = {
      suggested_replies: (analysis.suggestedActions || [])
        .slice(0, 3)
        .map((action, i) => ({
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

    return NextResponse.json({ 
      success: true, 
      analysis: analysisRecord 
    })
  } catch (error: any) {
    console.error('Error in POST /api/inbox-v2/analyze:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}





















































