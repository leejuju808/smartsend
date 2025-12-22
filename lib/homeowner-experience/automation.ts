// Block 25140 — SmartSend Roofing Homeowner Experience v1
// Automation service for homeowner confirmation flow and install day experience

import { createClient } from "@supabase/supabase-js";
import { sendEmailNotification } from "@/lib/notifications/email";
import { sendSMS } from "@/lib/providers/sms";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export interface HomeownerConfirmationOptions {
  workspaceId: string;
  jobId?: string;
  leadId?: string;
  contactId: string;
  confirmationType:
    | "inspection_booked"
    | "day_before_reminder"
    | "after_inspection"
    | "quote_sent"
    | "job_approved"
    | "install_confirmed"
    | "install_morning"
    | "install_midday"
    | "install_completion"
    | "cleanup_checklist"
    | "warranty_delivered"
    | "review_request";
  metadata?: Record<string, any>;
  channel?: "email" | "sms" | "both";
}

/**
 * Send homeowner confirmation message
 */
export async function sendHomeownerConfirmation(
  options: HomeownerConfirmationOptions
): Promise<{ success: boolean; error?: string; confirmationId?: string }> {
  try {
    const {
      workspaceId,
      jobId,
      leadId,
      contactId,
      confirmationType,
      metadata = {},
      channel = "email",
    } = options;

    // Get contact info
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, email, phone, first_name, last_name")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return { success: false, error: "Contact not found" };
    }

    // Get communication profile for personalization
    const { data: profile } = await supabase
      .from("homeowner_communication_profiles")
      .select("personality_type, preferred_channel")
      .eq("contact_id", contactId)
      .maybeSingle();

    // Determine actual channel based on preference
    const actualChannel = profile?.preferred_channel || channel;

    // Get template key
    const templateKey = getTemplateKey(confirmationType);

    // Get template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("base_subject, base_body, use_ai_rewriter")
      .eq("template_key", templateKey)
      .eq("org_id", "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    if (templateError || !template) {
      return { success: false, error: `Template not found: ${templateKey}` };
    }

    // Personalize message based on personality type
    const personalizedMessage = personalizeMessage(
      template.base_body,
      profile?.personality_type || "direct",
      {
        first_name: contact.first_name || "there",
        sender_name: metadata.sender_name || "Your Roofing Team",
        ...metadata,
      }
    );

    const personalizedSubject = personalizeMessage(
      template.base_subject,
      profile?.personality_type || "direct",
      {
        first_name: contact.first_name || "there",
        ...metadata,
      }
    );

    // Create confirmation record
    const { data: confirmation, error: confirmationError } = await supabase
      .from("homeowner_confirmations")
      .insert({
        workspace_id: workspaceId,
        job_id: jobId || null,
        lead_id: leadId || null,
        contact_id: contactId,
        confirmation_type: confirmationType,
        message_channel: actualChannel,
        message_subject: personalizedSubject,
        message_body: personalizedMessage,
        message_template_key: templateKey,
        status: "pending",
        metadata: metadata,
      })
      .select("id")
      .single();

    if (confirmationError) {
      return { success: false, error: confirmationError.message };
    }

    // Send message
    let sendSuccess = false;
    let sendError: string | undefined;

    if (actualChannel === "email" || actualChannel === "both") {
      if (contact.email) {
        const emailResult = await sendEmailNotification({
          to: contact.email,
          subject: personalizedSubject,
          html: personalizedMessage.replace(/\n/g, "<br>"),
          type: "homeowner_confirmation",
        });

        if (!emailResult.success) {
          sendError = emailResult.error;
        } else {
          sendSuccess = true;
        }
      }
    }

    if (actualChannel === "sms" || actualChannel === "both") {
      if (contact.phone) {
        try {
          const smsResult = await sendSMS(
            contact.phone,
            personalizedMessage.replace(/<[^>]+>/g, ""), // Strip HTML
            {
              provider: "twilio",
              credentials: {}, // Get from workspace settings
            }
          );

          if (smsResult.success) {
            sendSuccess = true;
          } else {
            sendError = smsResult.error || "SMS send failed";
          }
        } catch (err: any) {
          sendError = err.message;
        }
      }
    }

    // Update confirmation status
    await supabase
      .from("homeowner_confirmations")
      .update({
        status: sendSuccess ? "sent" : "failed",
        message_sent_at: sendSuccess ? new Date().toISOString() : null,
        error_message: sendError,
      })
      .eq("id", confirmation.id);

    // Create portal timeline event if job exists
    if (jobId) {
      await createPortalTimelineEvent({
        workspaceId,
        jobId,
        eventType: getTimelineEventType(confirmationType),
        eventTitle: getTimelineEventTitle(confirmationType),
        eventDescription: getTimelineEventDescription(confirmationType),
      });
    }

    return {
      success: sendSuccess,
      error: sendError,
      confirmationId: confirmation.id,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get template key for confirmation type
 */
function getTemplateKey(
  confirmationType: HomeownerConfirmationOptions["confirmationType"]
): string {
  const templateMap: Record<string, string> = {
    inspection_booked: "homeowner_inspection_booked",
    day_before_reminder: "homeowner_day_before_reminder",
    after_inspection: "homeowner_after_inspection",
    quote_sent: "homeowner_quote_sent",
    job_approved: "homeowner_job_approved",
    install_confirmed: "homeowner_install_morning", // Reuse morning template
    install_morning: "homeowner_install_morning",
    install_midday: "homeowner_install_midday",
    install_completion: "homeowner_install_completion",
    cleanup_checklist: "homeowner_cleanup_checklist",
    warranty_delivered: "homeowner_warranty_delivered",
    review_request: "homeowner_review_request",
  };

  return templateMap[confirmationType] || "homeowner_inspection_booked";
}

/**
 * Personalize message based on personality type
 */
function personalizeMessage(
  message: string,
  personalityType: string,
  variables: Record<string, any>
): string {
  let personalized = message;

  // Replace variables
  Object.keys(variables).forEach((key) => {
    personalized = personalized.replace(
      new RegExp(`{{${key}}}`, "g"),
      variables[key] || ""
    );
  });

  // Adjust based on personality
  switch (personalityType) {
    case "direct":
      // Keep it short and clear
      personalized = personalized.replace(/\n\n+/g, "\n\n");
      break;

    case "nervous":
      // Add reassurance phrases
      if (!personalized.includes("don't worry")) {
        personalized = "Don't worry — " + personalized.toLowerCase();
      }
      break;

    case "curious":
      // Add more detail markers
      if (!personalized.includes("Here's")) {
        personalized = personalized.replace(
          /(\.)/,
          ". Here's what that means:"
        );
      }
      break;

    case "passive":
      // Make it gentler
      personalized = personalized.replace(/You need to/g, "You can");
      personalized = personalized.replace(/You must/g, "We recommend");
      break;
  }

  return personalized;
}

/**
 * Create portal timeline event
 */
async function createPortalTimelineEvent(options: {
  workspaceId: string;
  jobId: string;
  eventType: string;
  eventTitle: string;
  eventDescription?: string;
}): Promise<void> {
  const { workspaceId, jobId, eventType, eventTitle, eventDescription } =
    options;

  // Get portal ID
  const { data: portal } = await supabase
    .from("homeowner_portals")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  await supabase.from("homeowner_portal_timeline_events").insert({
    workspace_id: workspaceId,
    job_id: jobId,
    portal_id: portal?.id || null,
    event_type: eventType,
    event_title: eventTitle,
    event_description: eventDescription,
    event_date: new Date().toISOString(),
    icon_name: getTimelineIcon(eventType),
    color: getTimelineColor(eventType),
  });
}

function getTimelineEventType(
  confirmationType: HomeownerConfirmationOptions["confirmationType"]
): string {
  const eventTypeMap: Record<string, string> = {
    inspection_booked: "status_changed",
    day_before_reminder: "update_posted",
    after_inspection: "inspection_completed",
    quote_sent: "update_posted",
    job_approved: "status_changed",
    install_confirmed: "installation_started",
    install_morning: "crew_assigned",
    install_midday: "update_posted",
    install_completion: "installation_finished",
    cleanup_checklist: "cleanup_completed",
    warranty_delivered: "warranty_delivered",
    review_request: "update_posted",
  };

  return eventTypeMap[confirmationType] || "update_posted";
}

function getTimelineEventTitle(
  confirmationType: HomeownerConfirmationOptions["confirmationType"]
): string {
  const titleMap: Record<string, string> = {
    inspection_booked: "Inspection Scheduled",
    day_before_reminder: "Inspection Reminder",
    after_inspection: "Inspection Completed",
    quote_sent: "Quote Sent",
    job_approved: "Job Approved",
    install_confirmed: "Installation Scheduled",
    install_morning: "Crew Arrived",
    install_midday: "Installation In Progress",
    install_completion: "Installation Complete",
    cleanup_checklist: "Cleanup Completed",
    warranty_delivered: "Warranty Delivered",
    review_request: "Review Request Sent",
  };

  return titleMap[confirmationType] || "Update";
}

function getTimelineEventDescription(
  confirmationType: HomeownerConfirmationOptions["confirmationType"]
): string {
  const descMap: Record<string, string> = {
    inspection_booked: "Your roof inspection has been scheduled",
    day_before_reminder: "Reminder: Inspection tomorrow",
    after_inspection: "Inspection completed successfully",
    quote_sent: "Your estimate is ready for review",
    job_approved: "Your project has been approved",
    install_confirmed: "Installation date confirmed",
    install_morning: "Crew has arrived and started work",
    install_midday: "Installation is progressing on schedule",
    install_completion: "Installation is complete",
    cleanup_checklist: "Cleanup has been completed",
    warranty_delivered: "Warranty information has been delivered",
    review_request: "We'd love to hear your feedback",
  };

  return descMap[confirmationType] || "";
}

function getTimelineIcon(eventType: string): string {
  const iconMap: Record<string, string> = {
    inspection_completed: "check",
    materials_delivered: "truck",
    installation_started: "hammer",
    installation_finished: "check-circle",
    cleanup_completed: "sparkles",
    warranty_delivered: "file-text",
    payment_received: "dollar-sign",
    status_changed: "refresh-cw",
    crew_assigned: "users",
    update_posted: "bell",
  };

  return iconMap[eventType] || "bell";
}

function getTimelineColor(eventType: string): string {
  const colorMap: Record<string, string> = {
    inspection_completed: "blue",
    materials_delivered: "purple",
    installation_started: "yellow",
    installation_finished: "green",
    cleanup_completed: "green",
    warranty_delivered: "blue",
    payment_received: "green",
    status_changed: "blue",
    crew_assigned: "purple",
    update_posted: "gray",
  };

  return colorMap[eventType] || "gray";
}

/**
 * Send insurance-related homeowner communication
 */
export async function sendInsuranceCommunication(options: {
  workspaceId: string;
  jobId: string;
  contactId: string;
  communicationType:
    | "acv_explanation"
    | "depreciation_timeline"
    | "supplement_process"
    | "adjuster_prep"
    | "check_issuance"
    | "insurance_update";
  metadata?: Record<string, any>;
  channel?: "email" | "sms" | "both";
}): Promise<{ success: boolean; error?: string }> {
  try {
    const {
      workspaceId,
      jobId,
      contactId,
      communicationType,
      metadata = {},
      channel = "email",
    } = options;

    // Get contact info
    const { data: contact } = await supabase
      .from("contacts")
      .select("email, phone, first_name")
      .eq("id", contactId)
      .single();

    if (!contact) {
      return { success: false, error: "Contact not found" };
    }

    // Get template key
    const templateKey = `homeowner_insurance_${communicationType}`;

    // Get template
    const { data: template } = await supabase
      .from("email_templates")
      .select("base_subject, base_body")
      .eq("template_key", templateKey)
      .eq("org_id", "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    if (!template) {
      return { success: false, error: `Template not found: ${templateKey}` };
    }

    // Personalize message
    const personalizedMessage = personalizeMessage(
      template.base_body,
      "curious", // Insurance explanations need detail
      {
        first_name: contact.first_name || "there",
        sender_name: metadata.sender_name || "Your Roofing Team",
        ...metadata,
      }
    );

    const personalizedSubject = personalizeMessage(
      template.base_subject,
      "curious",
      {
        first_name: contact.first_name || "there",
        ...metadata,
      }
    );

    // Create record
    await supabase.from("homeowner_insurance_communications").insert({
      workspace_id: workspaceId,
      job_id: jobId,
      contact_id: contactId,
      communication_type: communicationType,
      message_channel: channel,
      message_subject: personalizedSubject,
      message_body: personalizedMessage,
      message_template_key: templateKey,
      status: "pending",
      metadata: metadata,
    });

    // Send message (similar to confirmation flow)
    if (channel === "email" || channel === "both") {
      if (contact.email) {
        await sendEmailNotification({
          to: contact.email,
          subject: personalizedSubject,
          html: personalizedMessage.replace(/\n/g, "<br>"),
          type: "homeowner_insurance",
        });
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Submit homeowner feedback
 */
export async function submitHomeownerFeedback(options: {
  workspaceId: string;
  jobId: string;
  contactId: string;
  rating: number;
  feedbackText?: string;
  feedbackCategory?: string;
}): Promise<{ success: boolean; error?: string; feedbackId?: string }> {
  try {
    const {
      workspaceId,
      jobId,
      contactId,
      rating,
      feedbackText,
      feedbackCategory,
    } = options;

    // Create feedback record
    const { data: feedback, error: feedbackError } = await supabase
      .from("homeowner_feedback")
      .insert({
        workspace_id: workspaceId,
        job_id: jobId,
        contact_id: contactId,
        rating: rating,
        feedback_text: feedbackText || null,
        feedback_category: feedbackCategory || "overall",
        status: "submitted",
      })
      .select("id")
      .single();

    if (feedbackError) {
      return { success: false, error: feedbackError.message };
    }

    // If rating is low (1-2), escalate
    if (rating <= 2) {
      await supabase
        .from("homeowner_feedback")
        .update({
          status: "escalated",
          escalated_at: new Date().toISOString(),
          escalation_reason: "Low rating - requires attention",
        })
        .eq("id", feedback.id);

      // TODO: Create notification for owner
      // TODO: Create internal discussion task
    }

    // If rating is high (4-5), send review request
    if (rating >= 4) {
      await sendHomeownerConfirmation({
        workspaceId,
        jobId,
        contactId,
        confirmationType: "review_request",
        channel: "email",
      });
    }

    return { success: true, feedbackId: feedback.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

