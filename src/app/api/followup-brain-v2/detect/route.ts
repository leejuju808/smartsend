// Block 24900 — Follow-Up Brain v2: NLP Detection API Route

import { NextRequest, NextResponse } from "next/server";
import { detectReplyType } from "@/lib/followup-brain-v2/nlp-detection";
import { supabaseAdmin } from "@/server/supabase";
import { activateHotLead } from "@/lib/followup-brain-v2/hot-lead-activation";
import { handleObjection, detectObjectionType } from "@/lib/followup-brain-v2/objection-handling";
import { startSequence } from "@/lib/followup-brain-v2/sequences";
import { updateBehaviorPattern } from "@/lib/followup-brain-v2/behavior-timing";

export async function POST(req: NextRequest) {
  try {
    const { lead_id, reply_text, reply_id, subject } = await req.json();

    if (!lead_id || !reply_text) {
      return NextResponse.json(
        { error: "lead_id and reply_text are required" },
        { status: 400 }
      );
    }

    // Detect reply type
    const detection = await detectReplyType(reply_text, subject);

    // Store detection
    const { data: detectionRecord } = await supabaseAdmin
      .from('followup_nlp_detections')
      .insert({
        lead_id,
        email_reply_id: reply_id,
        detection_type: detection.detection_type,
        confidence_score: detection.confidence_score,
        detected_phrases: detection.detected_phrases,
        detected_intent: detection.detected_intent,
        homeowner_tone: detection.homeowner_tone,
        urgency_level: detection.urgency_level,
        extracted_info: detection.extracted_info,
        raw_reply_text: reply_text,
      })
      .select()
      .single();

    // Update behavior pattern
    await updateBehaviorPattern(lead_id, {
      type: 'reply',
      timestamp: new Date(),
    });

    // Trigger actions based on detection type
    const actions: string[] = [];

    // Get lead information for auto-booking (if booking intent detected)
    const { data: leadInfo } = await supabaseAdmin
      .from('leads')
      .select('email, first_name, last_name, phone, custom')
      .eq('id', lead_id)
      .maybeSingle();

    // Attempt auto-booking if reply shows booking intent
    // Check if the detected intent suggests booking/scheduling
    const bookingKeywords = ['schedule', 'appointment', 'estimate', 'inspection', 'visit', 'come by', 'available', 'when can', 'book'];
    const hasBookingIntent = bookingKeywords.some(keyword => 
      reply_text.toLowerCase().includes(keyword)
    ) || detection.detected_intent?.toLowerCase().includes('book') 
      || detection.detected_intent?.toLowerCase().includes('schedule');

    if (hasBookingIntent && leadInfo) {
      try {
        // Get user_id from workspace or lead association
        const { data: workspaceData } = await supabaseAdmin
          .from('leads')
          .select('workspace_id')
          .eq('id', lead_id)
          .single();

        if (workspaceData?.workspace_id) {
          // Get workspace owner/user_id
          const { data: workspace } = await supabaseAdmin
            .from('workspaces')
            .select('owner_id')
            .eq('id', workspaceData.workspace_id)
            .single();

          if (workspace?.owner_id) {
            // Call auto-booking API (non-blocking)
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
              ? `https://${process.env.VERCEL_URL}` 
              : 'http://localhost:3000';

            fetch(`${baseUrl}/api/appointments/auto-book`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: reply_text,
                lead_id,
                homeowner_name: leadInfo.first_name && leadInfo.last_name 
                  ? `${leadInfo.first_name} ${leadInfo.last_name}` 
                  : leadInfo.first_name || leadInfo.email?.split('@')[0] || null,
                address: leadInfo.custom?.address || leadInfo.custom?.homeowner_address || null,
                homeowner_email: leadInfo.email || null,
                homeowner_phone: leadInfo.phone || null,
              }),
            }).catch(err => {
              console.error('Auto-booking failed (non-blocking):', err);
            });

            actions.push('auto_booking_attempted');
          }
        }
      } catch (error) {
        console.error('Error attempting auto-booking:', error);
        // Don't fail the whole request if auto-booking fails
      }
    }

    if (detection.detection_type === 'hot_lead') {
      const activation = await activateHotLead(
        lead_id,
        detectionRecord.id,
        detection.detected_intent || 'urgent_request'
      );
      if (activation.activated) {
        actions.push('hot_lead_activated');
      }
    } else if (detection.detection_type === 'objection') {
      const objectionType = detectObjectionType(reply_text) || 'other';
      const handled = await handleObjection(
        lead_id,
        detectionRecord.id,
        reply_text,
        objectionType
      );
      if (handled) {
        actions.push('objection_handled');
      }
    } else if (detection.detection_type === 'warm_lead') {
      // Get workspace_id
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('workspace_id')
        .eq('id', lead_id)
        .single();

      if (lead?.workspace_id) {
        await startSequence(lead_id, 'inspection_booking', lead.workspace_id);
        actions.push('warm_lead_sequence_started');
      }
    } else if (detection.detection_type === 'not_interested') {
      // Stop all follow-ups
      await supabaseAdmin
        .from('followup_sequence_executions')
        .update({ status: 'cancelled' })
        .eq('lead_id', lead_id)
        .eq('status', 'pending');
      actions.push('followups_stopped');
    }

    return NextResponse.json({
      ok: true,
      detection: detectionRecord,
      actions_taken: actions,
    });
  } catch (error: any) {
    console.error('Error in detect route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}












