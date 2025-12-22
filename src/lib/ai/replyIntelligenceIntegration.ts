import { createClient } from "@supabase/supabase-js";
import { analyzeReplyIntelligence, ReplyIntelligenceResult } from "./replyBrainV2";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Integrate Reply Brain v2 intelligence into existing reply processing
 * 
 * This function can be called from any reply processing endpoint to:
 * 1. Analyze the reply with comprehensive intelligence
 * 2. Store the intelligence event
 * 3. Trigger auto pipeline movement and tagging
 */
export async function processReplyWithIntelligenceV2(params: {
  inboundMessageId?: string;
  contactId?: string;
  campaignId?: string;
  workspaceId: string;
  text: string;
  subject?: string;
}): Promise<ReplyIntelligenceResult & { eventId: string }> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Analyze reply with AI Brain v2
  const startTime = Date.now();
  const intelligence = await analyzeReplyIntelligence(params.text, params.subject);
  const processingTime = Date.now() - startTime;

  // Store intelligence event in database
  const { data: event, error: insertError } = await supabase
    .from("reply_intelligence_events")
    .insert({
      inbound_message_id: params.inboundMessageId || null,
      contact_id: params.contactId || null,
      campaign_id: params.campaignId || null,
      workspace_id: params.workspaceId,
      category: intelligence.category,
      confidence: intelligence.confidence,
      emotional_tone: intelligence.emotionalTone,
      tone_confidence: intelligence.toneConfidence,
      extracted_questions: intelligence.extractedQuestions,
      has_insurance_intent: intelligence.hasInsuranceIntent,
      insurance_keywords: intelligence.insuranceKeywords,
      insurance_confidence: intelligence.insuranceConfidence,
      has_booking_intent: intelligence.hasBookingIntent,
      booking_confidence: intelligence.bookingConfidence,
      has_objection: intelligence.hasObjection,
      objection_type: intelligence.objectionType || null,
      objection_text: intelligence.objectionText || null,
      has_urgent_damage: intelligence.hasUrgentDamage,
      damage_keywords: intelligence.damageKeywords,
      urgency_score: intelligence.urgencyScore,
      suggested_actions: intelligence.suggestedActions,
      suggested_reply_templates: intelligence.suggestedReplyTemplates,
      suggested_pipeline_stage: intelligence.suggestedPipelineStage,
      suggested_tags: intelligence.suggestedTags,
      raw_ai_response: intelligence.rawAiResponse,
      processing_time_ms: processingTime,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Error inserting intelligence event:", insertError);
    throw new Error(`Failed to store intelligence event: ${insertError.message}`);
  }

  // Update inbound_message with key intelligence fields
  if (params.inboundMessageId) {
    await supabase
      .from("inbound_messages")
      .update({
        emotional_tone: intelligence.emotionalTone,
        has_insurance_intent: intelligence.hasInsuranceIntent,
        has_booking_intent: intelligence.hasBookingIntent,
        has_urgent_damage: intelligence.hasUrgentDamage,
        extracted_questions: intelligence.extractedQuestions,
        suggested_actions: intelligence.suggestedActions,
      })
      .eq("id", params.inboundMessageId);
  }

  // Pipeline movement and tagging are handled automatically by the database trigger
  // But we can also manually trigger it if needed for immediate processing
  if (params.contactId) {
    const { error: processError } = await supabase.rpc(
      "process_reply_intelligence_event",
      { p_event_id: event.id }
    );

    if (processError) {
      console.error("Error processing intelligence event:", processError);
      // Don't throw, just log - the trigger will handle it eventually
    }
  }

  return {
    ...intelligence,
    eventId: event.id,
  };
}

/**
 * Get intelligence events for a contact, campaign, or workspace
 */
export async function getIntelligenceEvents(params: {
  contactId?: string;
  campaignId?: string;
  workspaceId?: string;
  limit?: number;
}) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let query = supabase
    .from("reply_intelligence_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(params.limit || 50);

  if (params.contactId) {
    query = query.eq("contact_id", params.contactId);
  }
  if (params.campaignId) {
    query = query.eq("campaign_id", params.campaignId);
  }
  if (params.workspaceId) {
    query = query.eq("workspace_id", params.workspaceId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get latest intelligence event for a contact
 */
export async function getLatestIntelligenceForContact(contactId: string) {
  const events = await getIntelligenceEvents({ contactId, limit: 1 });
  return events[0] || null;
}





















































