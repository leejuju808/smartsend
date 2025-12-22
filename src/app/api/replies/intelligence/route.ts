import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeReplyIntelligence, ReplyIntelligenceResult } from "@/lib/ai/replyBrainV2";

/**
 * POST /api/replies/intelligence
 * 
 * Block 16000 — SmartSend AI Reply Brain v2
 * 
 * Analyzes a homeowner reply with comprehensive intelligence:
 * - 18-category classification
 * - Emotional tone detection
 * - Question extraction
 * - Insurance intent recognition
 * - Booking intent detection
 * - Objection detection
 * - Auto-suggestions
 * - Auto pipeline movement
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      inbound_message_id, 
      contact_id, 
      campaign_id, 
      workspace_id,
      text, 
      subject 
    } = body;

    if (!text || !workspace_id) {
      return NextResponse.json(
        { error: "Missing required fields: text and workspace_id" },
        { status: 400 }
      );
    }

    // Analyze reply with AI Brain v2
    const startTime = Date.now();
    const intelligence = await analyzeReplyIntelligence(text, subject);
    const processingTime = Date.now() - startTime;

    const supabase = await createClient();

    // Store intelligence event in database
    const { data: event, error: insertError } = await supabase
      .from("reply_intelligence_events")
      .insert({
        inbound_message_id: inbound_message_id || null,
        contact_id: contact_id || null,
        campaign_id: campaign_id || null,
        workspace_id,
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
      return NextResponse.json(
        { error: "Failed to store intelligence event", details: insertError.message },
        { status: 500 }
      );
    }

    // Update inbound_message with key intelligence fields
    if (inbound_message_id) {
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
        .eq("id", inbound_message_id);
    }

    // Pipeline movement and tagging are handled automatically by the database trigger
    // But we can also manually trigger it if needed
    if (contact_id) {
      // The trigger will handle pipeline movement, but we can also call it explicitly
      const { error: processError } = await supabase.rpc(
        "process_reply_intelligence_event",
        { p_event_id: event.id }
      );

      if (processError) {
        console.error("Error processing intelligence event:", processError);
        // Don't fail the request, just log the error
      }
    }

    // Block 33602 — Auto-send booking link if scheduling intent detected
    if (intelligence.hasBookingIntent && intelligence.bookingConfidence > 0.7) {
      // Get lead_id from contact_id if available
      let leadIdForBooking: string | null = null;
      
      if (contact_id) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("id, email")
          .eq("id", contact_id)
          .single();

        if (contact) {
          // Try to find lead by email
          const { data: lead } = await supabase
            .from("leads")
            .select("id")
            .eq("email", contact.email)
            .eq("workspace_id", workspace_id)
            .maybeSingle();

          if (lead) {
            leadIdForBooking = lead.id;
          }
        }
      }

      // If we have a lead_id, trigger auto-booking-link
      if (leadIdForBooking) {
        // Call auto-booking-link asynchronously (don't block response)
        fetch(`${req.nextUrl.origin}/api/scheduling/auto-booking-link`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lead_id: leadIdForBooking,
            workspace_id,
            intelligence_result: intelligence,
          }),
        }).catch((err) => {
          console.error("Failed to auto-send booking link:", err);
          // Don't fail the request if booking link fails
        });
      }
    }

    return NextResponse.json({
      success: true,
      intelligence: {
        ...intelligence,
        eventId: event.id,
        processingTimeMs: processingTime,
      },
    });

  } catch (error: any) {
    console.error("Error in reply intelligence analysis:", error);
    return NextResponse.json(
      { 
        error: "Failed to analyze reply intelligence", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/replies/intelligence?contact_id=xxx
 * 
 * Get intelligence events for a contact
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const contactId = searchParams.get("contact_id");
    const campaignId = searchParams.get("campaign_id");
    const workspaceId = searchParams.get("workspace_id");

    if (!contactId && !campaignId && !workspaceId) {
      return NextResponse.json(
        { error: "Must provide contact_id, campaign_id, or workspace_id" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    let query = supabase
      .from("reply_intelligence_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (contactId) {
      query = query.eq("contact_id", contactId);
    }
    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, events: data || [] });

  } catch (error: any) {
    console.error("Error fetching intelligence events:", error);
    return NextResponse.json(
      { error: "Failed to fetch intelligence events", details: error.message },
      { status: 500 }
    );
  }
}




















