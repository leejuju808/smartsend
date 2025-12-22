/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Lead Nurture Engine
 * 
 * Functions for automatically enrolling leads in nurture sequences and sending emails
 */

import { createClient } from "@/lib/supabase/server";

/**
 * Enroll a lead in a nurture sequence
 */
export async function enrollLeadInNurtureSequence(
  leadId: string,
  sequenceId: string
): Promise<void> {
  const supabase = createClient();

  // Check if already enrolled
  const { data: existing } = await supabase
    .from("lead_nurture_enrollments")
    .select("id")
    .eq("lead_id", leadId)
    .eq("sequence_id", sequenceId)
    .single();

  if (existing) {
    return; // Already enrolled
  }

  // Get sequence
  const { data: sequence } = await supabase
    .from("lead_nurture_sequences")
    .select("*")
    .eq("id", sequenceId)
    .eq("is_active", true)
    .single();

  if (!sequence) {
    return;
  }

  // Get lead
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead) {
    return;
  }

  // Get contact if exists
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("email", lead.email)
    .single();

  // Enroll lead
  const steps = sequence.steps || [];
  const firstStep = steps.find((s: any) => s.step_order === 1);

  const nextStepDate = firstStep
    ? new Date(Date.now() + (firstStep.delay_days || 0) * 24 * 60 * 60 * 1000)
    : null;

  const { data: enrollment } = await supabase
    .from("lead_nurture_enrollments")
    .insert({
      sequence_id: sequenceId,
      lead_id: leadId,
      contact_id: contact?.id || null,
      status: "active",
      current_step: 0,
      next_step_scheduled_at: nextStepDate?.toISOString() || null,
    })
    .select()
    .single();

  if (enrollment && firstStep) {
    // Schedule first email
    await scheduleNurtureEmail({
      enrollmentId: enrollment.id,
      leadId,
      contactId: contact?.id,
      step: firstStep,
      email: lead.email,
      firstName: lead.first_name,
    });
  }

  // Update sequence stats
  await supabase
    .from("lead_nurture_sequences")
    .update({
      total_enrolled: (sequence.total_enrolled || 0) + 1,
    })
    .eq("id", sequenceId);
}

/**
 * Auto-enroll leads that match criteria
 */
export async function autoEnrollLeadsInNurture(
  workspaceId: string,
  sequenceId: string
): Promise<void> {
  const supabase = createClient();

  // Get sequence
  const { data: sequence } = await supabase
    .from("lead_nurture_sequences")
    .select("*")
    .eq("id", sequenceId)
    .eq("is_active", true)
    .single();

  if (!sequence) {
    return;
  }

  // Get workspace user IDs
  const { data: workspaceMembers } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);

  if (!workspaceMembers || workspaceMembers.length === 0) {
    return;
  }

  const userIds = workspaceMembers.map((m) => m.user_id);

  // Find leads matching criteria
  const targetAgeDays = sequence.target_lead_age_days || 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - targetAgeDays);

  let query = supabase
    .from("leads")
    .select("id, email, first_name, created_at")
    .in("user_id", userIds)
    .lte("created_at", cutoffDate.toISOString())
    .is("outcome", null); // Not converted yet

  // Apply status filters
  if (sequence.target_statuses && sequence.target_statuses.length > 0) {
    query = query.in("status", sequence.target_statuses);
  }

  const { data: leads } = await query;

  if (!leads || leads.length === 0) {
    return;
  }

  // Enroll each lead
  for (const lead of leads) {
    await enrollLeadInNurtureSequence(lead.id, sequenceId);
  }
}

/**
 * Process nurture sequence step sending
 */
export async function processNurtureSequenceSteps(): Promise<void> {
  const supabase = createClient();

  // Find enrollments ready for next step
  const now = new Date().toISOString();
  const { data: enrollments } = await supabase
    .from("lead_nurture_enrollments")
    .select(`
      *,
      sequence:lead_nurture_sequences(*),
      lead:leads(*),
      contact:contacts(*)
    `)
    .eq("status", "active")
    .lte("next_step_scheduled_at", now);

  if (!enrollments || enrollments.length === 0) {
    return;
  }

  for (const enrollment of enrollments) {
    const sequence = enrollment.sequence;
    if (!sequence) continue;

    const steps = sequence.steps || [];
    const nextStepOrder = (enrollment.current_step || 0) + 1;
    const nextStep = steps.find((s: any) => s.step_order === nextStepOrder);

    if (!nextStep) {
      // Sequence complete
      await supabase
        .from("lead_nurture_enrollments")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", enrollment.id);

      // Update sequence stats
      await supabase
        .from("lead_nurture_sequences")
        .update({
          total_completed: (sequence.total_completed || 0) + 1,
        })
        .eq("id", sequence.id);

      continue;
    }

    // Send email for this step
    const lead = enrollment.lead;
    const contact = enrollment.contact;

    await scheduleNurtureEmail({
      enrollmentId: enrollment.id,
      leadId: enrollment.lead_id,
      contactId: enrollment.contact_id,
      step: nextStep,
      email: lead?.email || contact?.email,
      firstName: lead?.first_name || contact?.first_name,
    });

    // Calculate next step date
    const nextStepDate = new Date();
    nextStepDate.setDate(nextStepDate.getDate() + (nextStep.delay_days || 0));

    // Update enrollment
    await supabase
      .from("lead_nurture_enrollments")
      .update({
        current_step: nextStepOrder,
        last_step_sent_at: new Date().toISOString(),
        next_step_scheduled_at: nextStepDate.toISOString(),
      })
      .eq("id", enrollment.id);
  }
}

/**
 * Mark nurture enrollment as converted
 */
export async function markNurtureEnrollmentConverted(
  enrollmentId: string,
  bookingId?: string
): Promise<void> {
  const supabase = createClient();

  await supabase
    .from("lead_nurture_enrollments")
    .update({
      status: "converted",
      converted_at: new Date().toISOString(),
      converted_to_booking: !!bookingId,
      booking_id: bookingId || null,
    })
    .eq("id", enrollmentId);
}

// Helper functions
async function scheduleNurtureEmail(params: {
  enrollmentId: string;
  leadId: string;
  contactId?: string;
  step: any;
  email: string;
  firstName?: string;
}): Promise<void> {
  // Render templates
  const subject = renderTemplate(params.step.subject_template, {
    first_name: params.firstName || "there",
  });

  const body = renderTemplate(params.step.body_template, {
    first_name: params.firstName || "there",
  });

  // Schedule email send (integrate with your email sending system)
  console.log("Scheduling nurture email:", { params, subject, body });
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return rendered;
}




































