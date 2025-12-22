// Block 24900 — Follow-Up Brain v2: NLP Objection Handling
// Detects objections and generates auto-replies

import { supabaseAdmin } from "@/server/supabase";
import { generateObjectionReply } from "./adaptive-modes";

export type ObjectionType = 
  | 'price_too_high'
  | 'already_have_contractor'
  | 'not_now'
  | 'maybe_later'
  | 'insurance_delay'
  | 'other';

/**
 * Handles an objection: detects type and sends auto-reply
 */
export async function handleObjection(
  leadId: string,
  detectionId: string,
  objectionText: string,
  objectionType: ObjectionType
): Promise<boolean> {
  try {
    // Get lead details
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (!lead) {
      return false;
    }

    // Generate objection reply
    const reply = generateObjectionReply(objectionType, {
      firstName: lead.first_name || lead.name,
      objectionText,
    });

    // Store objection handling record
    const { data: objectionRecord } = await supabaseAdmin
      .from('objection_handling')
      .insert({
        lead_id: leadId,
        detection_id: detectionId,
        objection_type: objectionType,
        objection_text: objectionText,
        auto_reply_generated: reply.body,
        auto_reply_sent: false,
        handled: false,
      })
      .select()
      .single();

    // Send auto-reply
    const emailSent = await sendObjectionReply(
      leadId,
      lead.email,
      reply.subject,
      reply.body
    );

    if (emailSent && objectionRecord) {
      await supabaseAdmin
        .from('objection_handling')
        .update({
          auto_reply_sent: true,
          auto_reply_sent_at: new Date().toISOString(),
        })
        .eq('id', objectionRecord.id);
    }

    // Create timeline event
    await supabaseAdmin
      .from('lead_timeline_events')
      .insert({
        lead_id: leadId,
        event_type: 'objection_handled',
        event_subtype: 'followup_brain_v2',
        message: `Objection detected and auto-reply sent: ${objectionType}`,
        metadata: {
          objection_type: objectionType,
          objection_text: objectionText,
        },
      });

    return emailSent;
  } catch (error) {
    console.error('Error handling objection:', error);
    return false;
  }
}

/**
 * Sends objection reply email
 */
async function sendObjectionReply(
  leadId: string,
  leadEmail: string,
  subject: string,
  body: string
): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('email_logs')
      .insert({
        lead_id: leadId,
        to_email: leadEmail,
        subject,
        body,
        status: 'sent',
        sent_at: new Date().toISOString(),
        source: 'followup_brain_v2_objection_handling',
      });

    return !error;
  } catch (error) {
    console.error('Error sending objection reply:', error);
    return false;
  }
}

/**
 * Detects objection type from text
 */
export function detectObjectionType(text: string): ObjectionType | null {
  const lowerText = text.toLowerCase();

  if (/too expensive|can't afford|out of budget|price|cost/i.test(lowerText)) {
    return 'price_too_high';
  }

  if (/already have|already got|hired someone|contractor|another company/i.test(lowerText)) {
    return 'already_have_contractor';
  }

  if (/waiting for insurance|insurance adjuster|insurance delay/i.test(lowerText)) {
    return 'insurance_delay';
  }

  if (/maybe later|not now|not right now|later/i.test(lowerText)) {
    return 'maybe_later';
  }

  if (/not now|can't now|busy now/i.test(lowerText)) {
    return 'not_now';
  }

  return null;
}






































