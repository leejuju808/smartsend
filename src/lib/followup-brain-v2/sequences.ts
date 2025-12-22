// Block 24900 — Follow-Up Brain v2: Follow-Up Sequences Engine
// Manages 4 sequence types: Inspection Booking, Quote Follow-Up, Insurance Nurture, Dormant Revival

import { supabaseAdmin } from "@/server/supabase";
import { calculateOptimalSendTime } from "./behavior-timing";

export type SequenceType = 
  | 'inspection_booking'
  | 'quote_followup'
  | 'insurance_nurture'
  | 'dormant_revival';

/**
 * Starts a follow-up sequence for a lead
 */
export async function startSequence(
  leadId: string,
  sequenceType: SequenceType,
  workspaceId?: string
): Promise<void> {
  try {
    // Get sequence steps
    const { data: steps } = await supabaseAdmin
      .from('followup_sequences')
      .select('*')
      .eq('sequence_type', sequenceType)
      .eq('is_active', true)
      .is('workspace_id', workspaceId ? null : null) // Get global or workspace-specific
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order('step_order', { ascending: true });

    if (!steps || steps.length === 0) {
      console.warn(`No steps found for sequence type: ${sequenceType}`);
      return;
    }

    // Schedule all steps
    const baseTime = new Date();
    for (const step of steps) {
      const scheduledFor = await calculateOptimalSendTime(leadId, baseTime);
      scheduledFor.setHours(scheduledFor.getHours() + step.delay_hours);

      await supabaseAdmin
        .from('followup_sequence_executions')
        .insert({
          lead_id: leadId,
          sequence_id: step.id,
          step_order: step.step_order,
          scheduled_for: scheduledFor.toISOString(),
          status: 'pending',
        });
    }
  } catch (error) {
    console.error('Error starting sequence:', error);
    throw error;
  }
}

/**
 * Processes pending sequence steps and sends them
 */
export async function processPendingSequences(): Promise<number> {
  try {
    const now = new Date().toISOString();

    // Get pending steps that are due
    const { data: pendingSteps } = await supabaseAdmin
      .from('followup_sequence_executions')
      .select(`
        *,
        followup_sequences (*),
        leads (*)
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', now);

    if (!pendingSteps || pendingSteps.length === 0) {
      return 0;
    }

    let sentCount = 0;

    for (const execution of pendingSteps) {
      const sequence = execution.followup_sequences;
      const lead = execution.leads;

      if (!sequence || !lead) {
        continue;
      }

      // Check if lead has replied (skip if replied)
      const { data: recentReplies } = await supabaseAdmin
        .from('email_replies')
        .select('id')
        .eq('lead_id', execution.lead_id)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (recentReplies && recentReplies.length > 0) {
        // Lead replied, skip this step
        await supabaseAdmin
          .from('followup_sequence_executions')
          .update({
            status: 'skipped',
            skip_reason: 'Lead replied',
          })
          .eq('id', execution.id);
        continue;
      }

      // Send the email
      const emailSent = await sendSequenceEmail(
        execution.lead_id,
        sequence,
        lead
      );

      if (emailSent) {
        await supabaseAdmin
          .from('followup_sequence_executions')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
          })
          .eq('id', execution.id);
        sentCount++;
      }
    }

    return sentCount;
  } catch (error) {
    console.error('Error processing pending sequences:', error);
    return 0;
  }
}

/**
 * Sends a sequence email
 */
async function sendSequenceEmail(
  leadId: string,
  sequence: any,
  lead: any
): Promise<boolean> {
  try {
    // Get template or use inline template
    let subject = sequence.subject_template || '';
    let body = sequence.body_template || '';

    if (sequence.template_key) {
      // Load from email_templates
      const { data: template } = await supabaseAdmin
        .from('email_templates')
        .select('*')
        .eq('template_key', sequence.template_key)
        .single();

      if (template) {
        subject = template.base_subject || subject;
        body = template.base_body || body;
      }
    }

    // Replace template variables
    subject = replaceTemplateVariables(subject, lead);
    body = replaceTemplateVariables(body, lead);

    // Send email
    const { error } = await supabaseAdmin
      .from('email_logs')
      .insert({
        lead_id: leadId,
        to_email: lead.email,
        subject,
        body,
        status: 'sent',
        sent_at: new Date().toISOString(),
        source: `followup_brain_v2_${sequence.sequence_type}`,
      });

    return !error;
  } catch (error) {
    console.error('Error sending sequence email:', error);
    return false;
  }
}

/**
 * Replaces template variables in text
 */
function replaceTemplateVariables(text: string, lead: any): string {
  return text
    .replace(/\{\{first_name\}\}/gi, lead.first_name || lead.name || 'there')
    .replace(/\{\{last_name\}\}/gi, lead.last_name || '')
    .replace(/\{\{email\}\}/gi, lead.email || '')
    .replace(/\{\{city\}\}/gi, lead.city || 'your area')
    .replace(/\{\{sender_name\}\}/gi, 'SmartSend Team');
}

/**
 * Cancels a sequence for a lead
 */
export async function cancelSequence(
  leadId: string,
  sequenceType?: SequenceType
): Promise<void> {
  try {
    const query = supabaseAdmin
      .from('followup_sequence_executions')
      .update({ status: 'cancelled' })
      .eq('lead_id', leadId)
      .eq('status', 'pending');

    if (sequenceType) {
      // Cancel specific sequence type
      const { data: sequences } = await supabaseAdmin
        .from('followup_sequences')
        .select('id')
        .eq('sequence_type', sequenceType);

      if (sequences && sequences.length > 0) {
        const sequenceIds = sequences.map(s => s.id);
        await query.in('sequence_id', sequenceIds);
      }
    } else {
      // Cancel all pending sequences
      await query;
    }
  } catch (error) {
    console.error('Error cancelling sequence:', error);
  }
}






































