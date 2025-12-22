/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Referral Automation Helper Functions
 * 
 * Functions for triggering referral requests after job completion, lead creation, etc.
 */

import { createClient } from "@/lib/supabase/server";

/**
 * Trigger referral automation after job completion
 */
export async function triggerReferralAfterJobCompletion(
  workspaceId: string,
  jobId: string,
  contactId?: string,
  leadId?: string
): Promise<void> {
  const supabase = createClient();

  // Find active referral automation configs
  const { data: automations } = await supabase
    .from("referral_automation")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .eq("trigger_type", "job_completion");

  if (!automations || automations.length === 0) {
    return;
  }

  // Get job details
  const { data: job } = await supabase
    .from("roofing_jobs")
    .select("*, contact:contacts(*), lead:leads(*)")
    .eq("id", jobId)
    .single();

  if (!job) {
    return;
  }

  // Get contact/lead info
  const contact = job.contact || (contactId ? await getContact(supabase, contactId) : null);
  const lead = job.lead || (leadId ? await getLead(supabase, leadId) : null);

  const email = contact?.email || lead?.email;
  const firstName = contact?.first_name || lead?.first_name;

  if (!email) {
    return;
  }

  // Process each automation
  for (const automation of automations) {
    // Calculate send date based on delay
    const sendDate = new Date();
    sendDate.setDate(sendDate.getDate() + (automation.trigger_delay_days || 0));

    // Create referral tracking record
    const { data: referralTracking } = await supabase
      .from("referral_tracking")
      .insert({
        workspace_id: workspaceId,
        source_job_id: jobId,
        source_contact_id: contact?.id || null,
        source_lead_id: lead?.id || null,
        referral_automation_id: automation.id,
        request_status: "pending",
      })
      .select()
      .single();

    if (!referralTracking) {
      continue;
    }

    // Render email template
    const subject = renderTemplate(automation.subject_template, {
      first_name: firstName || "there",
      company_name: "Your Roofing Company", // Get from workspace
    });

    const body = renderTemplate(automation.body_template, {
      first_name: firstName || "there",
      company_name: "Your Roofing Company",
      incentive_description: automation.incentive_description || "",
    });

    // Schedule email send (integrate with your email sending system)
    await scheduleReferralEmail({
      workspaceId,
      referralTrackingId: referralTracking.id,
      to: email,
      subject,
      body,
      scheduledAt: sendDate,
    });
  }
}

/**
 * Trigger referral automation after lead creation
 */
export async function triggerReferralAfterLeadCreation(
  workspaceId: string,
  leadId: string
): Promise<void> {
  const supabase = createClient();

  // Find active referral automation configs
  const { data: automations } = await supabase
    .from("referral_automation")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .eq("trigger_type", "lead_creation");

  if (!automations || automations.length === 0) {
    return;
  }

  // Get lead details
  const lead = await getLead(supabase, leadId);
  if (!lead || !lead.email) {
    return;
  }

  // Process automations (similar to job completion)
  for (const automation of automations) {
    const sendDate = new Date();
    sendDate.setDate(sendDate.getDate() + (automation.trigger_delay_days || 0));

    const { data: referralTracking } = await supabase
      .from("referral_tracking")
      .insert({
        workspace_id: workspaceId,
        source_lead_id: leadId,
        referral_automation_id: automation.id,
        request_status: "pending",
      })
      .select()
      .single();

    if (referralTracking) {
      // Schedule email
      const subject = renderTemplate(automation.subject_template, {
        first_name: lead.first_name || "there",
      });
      const body = renderTemplate(automation.body_template, {
        first_name: lead.first_name || "there",
        incentive_description: automation.incentive_description || "",
      });

      await scheduleReferralEmail({
        workspaceId,
        referralTrackingId: referralTracking.id,
        to: lead.email,
        subject,
        body,
        scheduledAt: sendDate,
      });
    }
  }
}

/**
 * Process referral reply and create leads
 */
export async function processReferralReply(
  referralTrackingId: string,
  referralContacts: Array<{ name: string; email: string; phone?: string; notes?: string }>
): Promise<void> {
  const supabase = createClient();

  // Get referral tracking
  const { data: referralTracking } = await supabase
    .from("referral_tracking")
    .select("*")
    .eq("id", referralTrackingId)
    .single();

  if (!referralTracking) {
    return;
  }

  // Update referral tracking
  await supabase
    .from("referral_tracking")
    .update({
      request_status: "replied",
      referral_contacts: referralContacts,
      referral_count: referralContacts.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", referralTrackingId);

  // Create leads from referrals
  const leadIds: string[] = [];
  for (const referral of referralContacts) {
    if (!referral.email) continue;

    // Get workspace user IDs
    const { data: workspaceMembers } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", referralTracking.workspace_id)
      .limit(1);

    if (!workspaceMembers || workspaceMembers.length === 0) continue;

    const userId = workspaceMembers[0].user_id;

    // Create lead
    const { data: lead } = await supabase
      .from("leads")
      .insert({
        user_id: userId,
        email: referral.email,
        first_name: referral.name?.split(" ")[0] || null,
        last_name: referral.name?.split(" ").slice(1).join(" ") || null,
        phone: referral.phone || null,
        source: "referral",
        notes: referral.notes || null,
      })
      .select("id")
      .single();

    if (lead) {
      leadIds.push(lead.id);
    }
  }

  // Update referral tracking with created leads
  await supabase
    .from("referral_tracking")
    .update({
      leads_created: leadIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", referralTrackingId);

  // Award incentive if configured
  const { data: automation } = await supabase
    .from("referral_automation")
    .select("*")
    .eq("id", referralTracking.referral_automation_id)
    .single();

  if (automation?.incentive_type && automation.incentive_type !== "none") {
    await awardReferralIncentive(referralTracking, automation);
  }
}

// Helper functions
async function getContact(supabase: any, contactId: string) {
  const { data } = await supabase.from("contacts").select("*").eq("id", contactId).single();
  return data;
}

async function getLead(supabase: any, leadId: string) {
  const { data } = await supabase.from("leads").select("*").eq("id", leadId).single();
  return data;
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return rendered;
}

async function scheduleReferralEmail(params: {
  workspaceId: string;
  referralTrackingId: string;
  to: string;
  subject: string;
  body: string;
  scheduledAt: Date;
}): Promise<void> {
  // Integrate with your email sending system
  // This is a placeholder - implement based on your email queue system
  console.log("Scheduling referral email:", params);
}

async function awardReferralIncentive(referralTracking: any, automation: any): Promise<void> {
  // Award incentive (gift card, discount, etc.)
  // This is a placeholder - implement based on your incentive system
  console.log("Awarding referral incentive:", { referralTracking, automation });
}




































