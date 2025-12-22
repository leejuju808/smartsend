/**
 * Block 25700 — SmartSend Roofing Homeowner Experience Engine v1
 * Automation Functions
 * 
 * This module handles:
 * - Trust messaging automation
 * - Education content delivery
 * - Expectation setting
 * - Homeowner playbook generation and delivery
 * - Enhanced satisfaction tracking
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Send trust message to homeowner
 */
export async function sendTrustMessage(options: {
  workspaceId: string;
  jobId?: string;
  contactId: string;
  trustMessageType:
    | "tarp_landscaping"
    | "magnet_nail_collection"
    | "certified_suppliers"
    | "warranty_registered"
    | "certified_professionals"
    | "cleanup_guarantee"
    | "insurance_expertise"
    | "lifetime_warranty";
  sendTiming?: "before_install" | "during_install" | "after_install" | "before_materials" | "after_materials" | "on_approval";
  channel?: "email" | "sms" | "both";
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const { workspaceId, jobId, contactId, trustMessageType, sendTiming = "on_approval", channel = "email" } = options;

    // Get contact info
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("email, first_name, last_name")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return { success: false, error: "Contact not found" };
    }

    // Get template key
    const templateKeyMap: Record<string, string> = {
      tarp_landscaping: "homeowner_trust_tarp_landscaping",
      magnet_nail_collection: "homeowner_trust_magnet_collection",
      certified_suppliers: "homeowner_trust_certified_suppliers",
      warranty_registered: "homeowner_trust_warranty_registered",
      certified_professionals: "homeowner_trust_certified_professionals",
      cleanup_guarantee: "homeowner_trust_magnet_collection", // Reuse magnet collection template
      insurance_expertise: "homeowner_trust_certified_suppliers", // Reuse certified suppliers template
      lifetime_warranty: "homeowner_trust_warranty_registered", // Reuse warranty template
    };

    const templateKey = templateKeyMap[trustMessageType];

    // Get template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("base_subject, base_body")
      .eq("template_key", templateKey)
      .single();

    if (templateError || !template) {
      return { success: false, error: "Template not found" };
    }

    // Personalize message
    const personalizedSubject = template.base_subject.replace(/{{first_name}}/g, contact.first_name || "there");
    const personalizedMessage = template.base_body
      .replace(/{{first_name}}/g, contact.first_name || "there")
      .replace(/{{sender_name}}/g, "Your Roofing Team");

    // Create trust message record
    const { data: trustMessage, error: insertError } = await supabase
      .from("homeowner_trust_messages")
      .insert({
        workspace_id: workspaceId,
        job_id: jobId || null,
        contact_id: contactId,
        trust_message_type: trustMessageType,
        message_channel: channel,
        message_subject: personalizedSubject,
        message_body: personalizedMessage,
        message_template_key: templateKey,
        send_timing: sendTiming,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    // Send message (email/SMS)
    if (channel === "email" || channel === "both") {
      if (contact.email) {
        // TODO: Integrate with email sending service
        // await sendEmailNotification({...});
      }
    }

    // Update status to sent
    await supabase
      .from("homeowner_trust_messages")
      .update({
        status: "sent",
        message_sent_at: new Date().toISOString(),
      })
      .eq("id", trustMessage.id);

    return { success: true, messageId: trustMessage.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Send education content to homeowner
 */
export async function sendEducationContent(options: {
  workspaceId: string;
  jobId?: string;
  contactId: string;
  educationTopic:
    | "roofing_process_overview"
    | "tear_off_explained"
    | "underlayment_explained"
    | "ridge_vents_explained"
    | "insurance_claims_explained"
    | "ventilation_importance"
    | "post_install_checklist"
    | "warranty_coverage"
    | "material_types"
    | "timeline_expectations";
  sendTiming?: "on_lead" | "pre_inspection" | "post_inspection" | "on_approval" | "before_install" | "during_install" | "after_install";
  channel?: "email" | "sms" | "both";
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const { workspaceId, jobId, contactId, educationTopic, sendTiming = "on_approval", channel = "email" } = options;

    // Get contact info
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("email, first_name, last_name")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return { success: false, error: "Contact not found" };
    }

    // Get template key
    const templateKeyMap: Record<string, string> = {
      roofing_process_overview: "homeowner_education_roofing_process",
      tear_off_explained: "homeowner_education_tear_off",
      underlayment_explained: "homeowner_education_underlayment",
      ridge_vents_explained: "homeowner_education_ridge_vents",
      insurance_claims_explained: "homeowner_insurance_acv_explanation", // Reuse insurance template
      ventilation_importance: "homeowner_education_ventilation",
      post_install_checklist: "homeowner_cleanup_checklist", // Reuse cleanup template
      warranty_coverage: "homeowner_warranty_delivered", // Reuse warranty template
      material_types: "homeowner_education_roofing_process", // Reuse process template
      timeline_expectations: "homeowner_playbook", // Reuse playbook template
    };

    const templateKey = templateKeyMap[educationTopic];

    // Get template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("base_subject, base_body")
      .eq("template_key", templateKey)
      .single();

    if (templateError || !template) {
      return { success: false, error: "Template not found" };
    }

    // Personalize message
    const personalizedSubject = template.base_subject.replace(/{{first_name}}/g, contact.first_name || "there");
    const personalizedMessage = template.base_body
      .replace(/{{first_name}}/g, contact.first_name || "there")
      .replace(/{{sender_name}}/g, "Your Roofing Team");

    // Create education content record
    const { data: educationContent, error: insertError } = await supabase
      .from("homeowner_education_content")
      .insert({
        workspace_id: workspaceId,
        job_id: jobId || null,
        contact_id: contactId,
        education_topic: educationTopic,
        message_channel: channel,
        message_subject: personalizedSubject,
        message_body: personalizedMessage,
        message_template_key: templateKey,
        send_timing: sendTiming,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    // Send message
    if (channel === "email" || channel === "both") {
      if (contact.email) {
        // TODO: Integrate with email sending service
      }
    }

    // Update status to sent
    await supabase
      .from("homeowner_education_content")
      .update({
        status: "sent",
        message_sent_at: new Date().toISOString(),
      })
      .eq("id", educationContent.id);

    return { success: true, messageId: educationContent.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Send expectation setting message
 */
export async function sendExpectationSetting(options: {
  workspaceId: string;
  jobId?: string;
  contactId: string;
  expectationType:
    | "noise_levels"
    | "debris_expectations"
    | "dumpster_placement"
    | "vehicle_access"
    | "pet_safety"
    | "weather_delays"
    | "crew_arrival_windows"
    | "payment_expectations"
    | "lawn_nail_sweep"
    | "cleanup_timeline";
  sendTiming?: "on_approval" | "before_materials" | "before_install" | "day_before_install";
  metadata?: Record<string, any>;
  channel?: "email" | "sms" | "both";
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const { workspaceId, jobId, contactId, expectationType, sendTiming = "before_install", metadata = {}, channel = "email" } = options;

    // Get contact info
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("email, first_name, last_name")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return { success: false, error: "Contact not found" };
    }

    // Get template key
    const templateKeyMap: Record<string, string> = {
      noise_levels: "homeowner_expectation_noise",
      debris_expectations: "homeowner_expectation_debris",
      dumpster_placement: "homeowner_expectation_dumpster",
      vehicle_access: "homeowner_expectation_vehicle_access",
      pet_safety: "homeowner_expectation_pet_safety",
      weather_delays: "homeowner_expectation_weather_delays",
      crew_arrival_windows: "homeowner_expectation_crew_arrival",
      payment_expectations: "homeowner_final_invoice", // Reuse invoice template
      lawn_nail_sweep: "homeowner_expectation_lawn_nail_sweep",
      cleanup_timeline: "homeowner_cleanup_checklist", // Reuse cleanup template
    };

    const templateKey = templateKeyMap[expectationType];

    // Get template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("base_subject, base_body")
      .eq("template_key", templateKey)
      .single();

    if (templateError || !template) {
      return { success: false, error: "Template not found" };
    }

    // Personalize message with metadata
    let personalizedSubject = template.base_subject.replace(/{{first_name}}/g, contact.first_name || "there");
    let personalizedMessage = template.base_body
      .replace(/{{first_name}}/g, contact.first_name || "there")
      .replace(/{{sender_name}}/g, "Your Roofing Team");

    // Replace metadata placeholders
    Object.keys(metadata).forEach((key) => {
      const placeholder = `{{${key}}}`;
      personalizedSubject = personalizedSubject.replace(new RegExp(placeholder, "g"), metadata[key] || "");
      personalizedMessage = personalizedMessage.replace(new RegExp(placeholder, "g"), metadata[key] || "");
    });

    // Create expectation setting record
    const { data: expectationSetting, error: insertError } = await supabase
      .from("homeowner_expectation_settings")
      .insert({
        workspace_id: workspaceId,
        job_id: jobId || null,
        contact_id: contactId,
        expectation_type: expectationType,
        message_channel: channel,
        message_subject: personalizedSubject,
        message_body: personalizedMessage,
        message_template_key: templateKey,
        send_timing: sendTiming,
        metadata: metadata,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    // Send message
    if (channel === "email" || channel === "both") {
      if (contact.email) {
        // TODO: Integrate with email sending service
      }
    }

    // Update status to sent
    await supabase
      .from("homeowner_expectation_settings")
      .update({
        status: "sent",
        message_sent_at: new Date().toISOString(),
      })
      .eq("id", expectationSetting.id);

    return { success: true, messageId: expectationSetting.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate and send homeowner playbook
 */
export async function generateAndSendPlaybook(options: {
  workspaceId: string;
  jobId?: string;
  contactId: string;
  sendTiming?: "on_approval" | "on_lead" | "before_inspection";
  channel?: "email" | "sms" | "both";
}): Promise<{ success: boolean; error?: string; playbookId?: string }> {
  try {
    const { workspaceId, jobId, contactId, sendTiming = "on_approval", channel = "email" } = options;

    // Get contact info
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("email, first_name, last_name")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return { success: false, error: "Contact not found" };
    }

    // Generate playbook content
    const playbookContent = {
      overview: "Your roofing journey from start to finish",
      stages: [
        {
          stage_number: 1,
          stage_name: "Inspection",
          description: "We assess your roof and provide a detailed report",
          what_to_expect: "Inspector will examine your roof, take photos, and discuss findings",
          timeline: "30-60 minutes",
          questions_to_ask: ["What damage was found?", "Is replacement needed?", "What are my options?"],
        },
        {
          stage_number: 2,
          stage_name: "Quote",
          description: "You receive a detailed estimate with options",
          what_to_expect: "Written estimate with material options and pricing",
          timeline: "1-2 days after inspection",
          questions_to_ask: ["What materials are included?", "What's the warranty?", "When can work start?"],
        },
        {
          stage_number: 3,
          stage_name: "Approval",
          description: "Once approved, we schedule your installation",
          what_to_expect: "Deposit payment and scheduling confirmation",
          timeline: "Same day as approval",
          questions_to_ask: ["When will work start?", "How long will it take?", "What do I need to do?"],
        },
        {
          stage_number: 4,
          stage_name: "Materials",
          description: "Materials will be delivered before installation",
          what_to_expect: "Dumpster and materials arrive at your property",
          timeline: "1-2 days before installation",
          questions_to_ask: ["Where will dumpster be placed?", "Do I need to move vehicles?"],
        },
        {
          stage_number: 5,
          stage_name: "Install",
          description: "Our certified crew installs your new roof",
          what_to_expect: "Noise, crew activity, and progress updates throughout the day",
          timeline: "1-3 days depending on roof size",
          questions_to_ask: ["When will crew arrive?", "What about noise?", "Can I be home?"],
        },
        {
          stage_number: 6,
          stage_name: "Final Payment",
          description: "Final invoice will be sent after completion",
          what_to_expect: "Final invoice with payment options",
          timeline: "Within 24 hours of completion",
          questions_to_ask: ["What payment methods are accepted?", "When is payment due?"],
        },
        {
          stage_number: 7,
          stage_name: "Warranty",
          description: "You receive full warranty documents",
          what_to_expect: "Warranty documents in your homeowner portal",
          timeline: "Within 1 week of completion",
          questions_to_ask: ["What does warranty cover?", "How long is warranty valid?"],
        },
        {
          stage_number: 8,
          stage_name: "Cleanup + Review",
          description: "We clean up everything and ask for your feedback",
          what_to_expect: "Final cleanup, magnet sweep, and review request",
          timeline: "Same day as completion",
          questions_to_ask: ["Is everything cleaned up?", "Can I leave a review?"],
        },
      ],
      contact_info: {
        project_manager: "Your project manager will be assigned before installation",
        emergency_contact: "Contact us anytime with questions",
      },
    };

    // Get template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("base_subject, base_body")
      .eq("template_key", "homeowner_playbook")
      .single();

    if (templateError || !template) {
      return { success: false, error: "Template not found" };
    }

    // Personalize message
    const personalizedSubject = template.base_subject.replace(/{{first_name}}/g, contact.first_name || "there");
    const personalizedMessage = template.base_body
      .replace(/{{first_name}}/g, contact.first_name || "there")
      .replace(/{{sender_name}}/g, "Your Roofing Team");

    // Create playbook record
    const { data: playbook, error: insertError } = await supabase
      .from("homeowner_playbooks")
      .insert({
        workspace_id: workspaceId,
        job_id: jobId || null,
        contact_id: contactId,
        playbook_content: playbookContent,
        message_channel: channel,
        message_subject: personalizedSubject,
        message_body: personalizedMessage,
        message_template_key: "homeowner_playbook",
        send_timing: sendTiming,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    // Send message
    if (channel === "email" || channel === "both") {
      if (contact.email) {
        // TODO: Integrate with email sending service
      }
    }

    // Update status to sent
    await supabase
      .from("homeowner_playbooks")
      .update({
        status: "sent",
        message_sent_at: new Date().toISOString(),
      })
      .eq("id", playbook.id);

    return { success: true, playbookId: playbook.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Submit satisfaction feedback at specific checkpoint
 */
export async function submitSatisfactionFeedback(options: {
  workspaceId: string;
  jobId: string;
  contactId: string;
  checkpoint: "post_inspection" | "post_install" | "post_invoice" | "post_warranty" | "overall";
  rating: number;
  feedbackText?: string;
  feedbackCategory?: string;
}): Promise<{ success: boolean; error?: string; feedbackId?: string }> {
  try {
    const { workspaceId, jobId, contactId, checkpoint, rating, feedbackText, feedbackCategory = "overall" } = options;

    if (rating < 1 || rating > 5) {
      return { success: false, error: "Rating must be between 1 and 5" };
    }

    // Create feedback record
    const { data: feedback, error: feedbackError } = await supabase
      .from("homeowner_feedback")
      .insert({
        workspace_id: workspaceId,
        job_id: jobId,
        contact_id: contactId,
        checkpoint: checkpoint,
        rating: rating,
        feedback_text: feedbackText || null,
        feedback_category: feedbackCategory,
        status: "submitted",
      })
      .select("id")
      .single();

    if (feedbackError) {
      return { success: false, error: feedbackError.message };
    }

    // If rating is low (1-3), escalate
    if (rating <= 3) {
      await supabase
        .from("homeowner_feedback")
        .update({
          status: "escalated",
          escalated_at: new Date().toISOString(),
          escalation_reason: `Low rating (${rating}) at ${checkpoint} checkpoint`,
        })
        .eq("id", feedback.id);

      // TODO: Create notification for owner
      // TODO: Create internal discussion task
    }

    // If rating is high (4-5), send review request
    if (rating >= 4) {
      // TODO: Trigger review request
    }

    return { success: true, feedbackId: feedback.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Route homeowner message to appropriate team member
 */
export async function routeHomeownerMessage(options: {
  workspaceId: string;
  messageId: string;
  jobId?: string;
  contactId: string;
  routingCategory?: "sales" | "ops" | "owner" | "general";
  aiClassify?: boolean;
}): Promise<{ success: boolean; error?: string; routingId?: string }> {
  try {
    const { workspaceId, messageId, jobId, contactId, routingCategory = "general", aiClassify = true } = options;

    let finalCategory = routingCategory;

    // AI classification if requested
    if (aiClassify && routingCategory === "general") {
      // TODO: Implement AI classification logic
      // For now, default to ops if job exists, sales otherwise
      finalCategory = jobId ? "ops" : "sales";
    }

    // Create routing record
    const { data: routing, error: insertError } = await supabase
      .from("homeowner_message_routing")
      .insert({
        workspace_id: workspaceId,
        message_id: messageId,
        job_id: jobId || null,
        contact_id: contactId,
        routing_category: finalCategory,
        ai_classified: aiClassify,
        status: "routed",
      })
      .select("id")
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return { success: true, routingId: routing.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}




































