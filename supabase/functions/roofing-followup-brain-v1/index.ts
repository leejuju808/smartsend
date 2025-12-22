// Block 21705 — SmartSend Roofing Follow-Up Brain v1
// The Core Logic That Makes SmartSend Feel Alive to Roofers
// Runs every hour to check and execute follow-up actions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RoofingFollowUpState {
  id: string;
  campaign_contact_id: string;
  workspace_id: string;
  campaign_id: string;
  contact_id: string | null;
  initial_email_sent_at: string;
  followup_step: number;
  next_followup_at: string | null;
  last_followup_sent_at: string | null;
  status: string;
  has_replied: boolean;
  last_reply_at: string | null;
  reply_intent: string | null;
  cold_lead: boolean;
  next_action: string | null;
}

interface FollowUpTemplate {
  id: string;
  followup_step: number;
  subject: string;
  body: string;
}

interface CampaignContact {
  id: string;
  contact_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();

    console.log(`[Roofing Follow-Up Brain v1] Starting run at ${now.toISOString()}`);

    // ============================================================
    // RULE 5: If Homeowner Replies ANYTHING → Stop Follow-Ups Immediately
    // ============================================================
    await stopFollowUpsForRepliedContacts(supabase);

    // ============================================================
    // RULE 6: If Reply Intent = "Warm Lead" → Auto-Send Thank You + Booking Link
    // ============================================================
    await processWarmLeads(supabase);

    // ============================================================
    // RULE 7: If Reply Intent = "Hot Lead" → Trigger Priority Status
    // ============================================================
    await processHotLeads(supabase);

    // ============================================================
    // RULE 8: If Reply Intent = "Not Interested" → Move to "Unqualified" Bucket
    // ============================================================
    await processNotInterestedLeads(supabase);

    // ============================================================
    // RULE 1-3: No Reply After X Days → Send Follow-Up Sequence
    // ============================================================
    const followUpResults = await processFollowUpSequence(supabase, now);

    // ============================================================
    // RULE 4: If Still No Reply After 14 Days → Archive + Mark "Cold Lead"
    // ============================================================
    const coldLeadResults = await archiveColdLeads(supabase, now);

    const summary = {
      success: true,
      message: "Roofing follow-up brain executed successfully",
      followups_sent: followUpResults.sent,
      followups_scheduled: followUpResults.scheduled,
      warm_leads_processed: followUpResults.warmProcessed,
      hot_leads_processed: followUpResults.hotProcessed,
      cold_leads_archived: coldLeadResults.archived,
      stopped_on_reply: followUpResults.stoppedOnReply,
    };

    console.log(`[Roofing Follow-Up Brain v1] Summary:`, summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Roofing Follow-Up Brain v1] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * RULE 5: Stop follow-ups for contacts that have replied
 */
async function stopFollowUpsForRepliedContacts(supabase: any) {
  // Find active follow-up states where contact has replied
  const { data: states, error } = await supabase
    .from("roofing_followup_states")
    .select("*")
    .eq("status", "active")
    .eq("has_replied", false);

  if (error) {
    console.error("Error fetching follow-up states:", error);
    return;
  }

  if (!states || states.length === 0) {
    return;
  }

  let stopped = 0;
  for (const state of states) {
    // Check if contact has replied
    const hasReplied = await checkIfContactReplied(supabase, state.campaign_contact_id);
    
    if (hasReplied) {
      // Get latest reply intent
      const replyIntent = await getReplyIntent(supabase, state.campaign_contact_id);
      
      await supabase
        .from("roofing_followup_states")
        .update({
          status: "stopped",
          has_replied: true,
          last_reply_at: new Date().toISOString(),
          reply_intent: replyIntent || "neutral",
          next_action: "none",
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.id);
      
      stopped++;
    }
  }

  console.log(`[Stop on Reply] Stopped ${stopped} follow-up sequences`);
}

/**
 * RULE 6: Process warm leads - auto-send thank you + booking link
 */
async function processWarmLeads(supabase: any) {
  const { data: states, error } = await supabase
    .from("roofing_followup_states")
    .select("*")
    .eq("reply_intent", "warm")
    .eq("status", "stopped");

  if (error || !states || states.length === 0) {
    return;
  }

  let processed = 0;
  for (const state of states) {
    // Check if we already sent warm lead response
    const { data: existing } = await supabase
      .from("roofing_followup_messages")
      .select("id")
      .eq("followup_state_id", state.id)
      .eq("followup_step", 0) // Special step for warm lead response
      .eq("status", "sent")
      .maybeSingle();

    if (existing) {
      continue; // Already sent
    }

    // Get contact details
    const contact = await getCampaignContact(supabase, state.campaign_contact_id);
    if (!contact) continue;

    // Send thank you + booking link email
    const subject = "Thanks for getting back — here's our quick link";
    const body = `Hey ${contact.first_name || "there"},

Thanks for getting back — here's our quick link to get you on the schedule:

[BOOKING_LINK_PLACEHOLDER]

Let me know if you have any questions!

Best,
[ROOFER_NAME]`;

    await sendFollowUpEmail(supabase, {
      followup_state_id: state.id,
      campaign_contact_id: state.campaign_contact_id,
      workspace_id: state.workspace_id,
      followup_step: 0, // Special step for warm lead
      subject,
      body,
      contact_email: contact.email,
      contact_name: contact.first_name || null,
    });

    processed++;
  }

  console.log(`[Warm Leads] Processed ${processed} warm leads`);
}

/**
 * RULE 7: Process hot leads - trigger priority status
 */
async function processHotLeads(supabase: any) {
  const { data: states, error } = await supabase
    .from("roofing_followup_states")
    .select("*")
    .eq("reply_intent", "hot")
    .in("status", ["stopped", "active"]);

  if (error || !states || states.length === 0) {
    return;
  }

  let processed = 0;
  for (const state of states) {
    // Update status to paused (hot leads get priority)
    await supabase
      .from("roofing_followup_states")
      .update({
        status: "paused",
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.id);

    // Update contact/lead priority if tables exist
    // This would mark lead_value = high, pin conversation, etc.
    // Implementation depends on your schema
    
    processed++;
  }

  console.log(`[Hot Leads] Processed ${processed} hot leads`);
}

/**
 * RULE 8: Process not interested leads - move to unqualified
 */
async function processNotInterestedLeads(supabase: any) {
  const { data: states, error } = await supabase
    .from("roofing_followup_states")
    .select("*")
    .eq("reply_intent", "not_interested")
    .in("status", ["stopped", "active"]);

  if (error || !states || states.length === 0) {
    return;
  }

  let processed = 0;
  for (const state of states) {
    // Update status to stopped
    await supabase
      .from("roofing_followup_states")
      .update({
        status: "stopped",
        next_action: "none",
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.id);

    // Add to suppression list to keep domain safe
    if (state.contact_id) {
      const contact = await getCampaignContact(supabase, state.campaign_contact_id);
      if (contact) {
        // Add to suppression list (implementation depends on your schema)
        // This prevents future contact
      }
    }
    
    processed++;
  }

  console.log(`[Not Interested] Processed ${processed} not interested leads`);
}

/**
 * RULES 1-3: Process follow-up sequence (48hr, 4day, 7day)
 */
async function processFollowUpSequence(supabase: any, now: Date) {
  // Find active follow-up states that are due
  const { data: states, error } = await supabase
    .from("roofing_followup_states")
    .select("*")
    .eq("status", "active")
    .lte("next_followup_at", now.toISOString())
    .eq("has_replied", false)
    .eq("cold_lead", false);

  if (error) {
    console.error("Error fetching follow-up states:", error);
    return { sent: 0, scheduled: 0, warmProcessed: 0, hotProcessed: 0, stoppedOnReply: 0 };
  }

  if (!states || states.length === 0) {
    return { sent: 0, scheduled: 0, warmProcessed: 0, hotProcessed: 0, stoppedOnReply: 0 };
  }

  let sent = 0;
  let scheduled = 0;
  let stoppedOnReply = 0;

  for (const state of states) {
    // Double-check if contact has replied (safety check)
    const hasReplied = await checkIfContactReplied(supabase, state.campaign_contact_id);
    if (hasReplied) {
      await supabase
        .from("roofing_followup_states")
        .update({
          status: "stopped",
          has_replied: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.id);
      stoppedOnReply++;
      continue;
    }

    // Check which follow-up step we're on
    const daysSinceInitial = Math.floor(
      (now.getTime() - new Date(state.initial_email_sent_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    let followupStep = state.followup_step;
    let shouldSend = false;

    // RULE 1: 48 hours → Follow-Up #1
    if (daysSinceInitial >= 2 && state.followup_step === 0) {
      followupStep = 1;
      shouldSend = true;
    }
    // RULE 2: 4 days → Follow-Up #2
    else if (daysSinceInitial >= 4 && state.followup_step === 1) {
      followupStep = 2;
      shouldSend = true;
    }
    // RULE 3: 7 days → Follow-Up #3
    else if (daysSinceInitial >= 7 && state.followup_step === 2) {
      followupStep = 3;
      shouldSend = true;
    }

    if (shouldSend) {
      // Get template for this step
      const template = await getFollowUpTemplate(supabase, state.workspace_id, followupStep);
      if (!template) {
        console.error(`No template found for step ${followupStep}`);
        continue;
      }

      // Get contact details
      const contact = await getCampaignContact(supabase, state.campaign_contact_id);
      if (!contact) continue;

      // Personalize template
      const subject = personalizeTemplate(template.subject, contact);
      const body = personalizeTemplate(template.body, contact);

      // Send follow-up email
      await sendFollowUpEmail(supabase, {
        followup_state_id: state.id,
        campaign_contact_id: state.campaign_contact_id,
        workspace_id: state.workspace_id,
        followup_step: followupStep,
        subject,
        body,
        contact_email: contact.email,
        contact_name: contact.first_name || null,
      });

      // Update state
      let nextFollowupAt: string | null = null;
      let nextAction: string | null = null;

      if (followupStep === 1) {
        // Schedule follow-up #2 for 4 days (2 days from now)
        nextFollowupAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
        nextAction = "followup_2";
      } else if (followupStep === 2) {
        // Schedule follow-up #3 for 7 days (3 days from now)
        nextFollowupAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
        nextAction = "followup_3";
      } else if (followupStep === 3) {
        // No more follow-ups, will be archived after 14 days
        nextAction = "archive";
      }

      await supabase
        .from("roofing_followup_states")
        .update({
          followup_step: followupStep,
          last_followup_sent_at: now.toISOString(),
          next_followup_at: nextFollowupAt,
          next_action: nextAction,
          updated_at: now.toISOString(),
        })
        .eq("id", state.id);

      sent++;
    } else {
      // Schedule next follow-up
      scheduled++;
    }
  }

  return { sent, scheduled, warmProcessed: 0, hotProcessed: 0, stoppedOnReply };
}

/**
 * RULE 4: Archive cold leads after 14 days
 */
async function archiveColdLeads(supabase: any, now: Date) {
  // Find active states that are 14+ days old with no reply
  const { data: states, error } = await supabase
    .from("roofing_followup_states")
    .select("*")
    .eq("status", "active")
    .eq("has_replied", false)
    .eq("cold_lead", false);

  if (error || !states || states.length === 0) {
    return { archived: 0 };
  }

  let archived = 0;
  for (const state of states) {
    const daysSinceInitial = Math.floor(
      (now.getTime() - new Date(state.initial_email_sent_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceInitial >= 14) {
      await supabase
        .from("roofing_followup_states")
        .update({
          status: "cold_lead",
          cold_lead: true,
          next_action: "none",
          updated_at: now.toISOString(),
        })
        .eq("id", state.id);

      archived++;
    }
  }

  console.log(`[Cold Leads] Archived ${archived} cold leads`);
  return { archived };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function checkIfContactReplied(supabase: any, campaignContactId: string): Promise<boolean> {
  // Check email_replies table
  const { data: emailReplies } = await supabase
    .from("email_replies")
    .select("id")
    .eq("campaign_contact_id", campaignContactId)
    .limit(1);

  if (emailReplies && emailReplies.length > 0) {
    return true;
  }

  // Check replies table via contact_id
  const { data: campaignContact } = await supabase
    .from("campaign_contacts")
    .select("contact_id")
    .eq("id", campaignContactId)
    .maybeSingle();

  if (campaignContact?.contact_id) {
    const { data: replies } = await supabase
      .from("replies")
      .select("id")
      .eq("lead_id", campaignContact.contact_id)
      .limit(1);

    if (replies && replies.length > 0) {
      return true;
    }
  }

  return false;
}

async function getReplyIntent(supabase: any, campaignContactId: string): Promise<string | null> {
  const { data: campaignContact } = await supabase
    .from("campaign_contacts")
    .select("contact_id")
    .eq("id", campaignContactId)
    .maybeSingle();

  if (!campaignContact?.contact_id) {
    return null;
  }

  const { data: replyIntent } = await supabase
    .from("reply_intents")
    .select("intent")
    .eq("lead_id", campaignContact.contact_id)
    .order("classified_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!replyIntent) {
    return null;
  }

  // Map intent values
  const intent = replyIntent.intent;
  if (intent === "hot" || intent === "warm" || intent === "not_interested") {
    return intent;
  }

  return "neutral";
}

async function getCampaignContact(
  supabase: any,
  campaignContactId: string
): Promise<CampaignContact | null> {
  const { data, error } = await supabase
    .from("campaign_contacts")
    .select(`
      id,
      contact_id,
      contacts:contact_id (
        email,
        first_name,
        last_name
      )
    `)
    .eq("id", campaignContactId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const contact = data.contacts || {};
  return {
    id: data.id,
    contact_id: data.contact_id,
    email: contact.email || "",
    first_name: contact.first_name || null,
    last_name: contact.last_name || null,
  };
}

async function getFollowUpTemplate(
  supabase: any,
  workspaceId: string,
  step: number
): Promise<FollowUpTemplate | null> {
  // Try workspace-specific template first
  const { data: workspaceTemplate } = await supabase
    .from("roofing_followup_templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("followup_step", step)
    .eq("is_active", true)
    .maybeSingle();

  if (workspaceTemplate) {
    return workspaceTemplate;
  }

  // Fall back to default template
  const { data: defaultTemplate } = await supabase
    .from("roofing_followup_templates")
    .select("*")
    .is("workspace_id", null)
    .eq("followup_step", step)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  return defaultTemplate || null;
}

function personalizeTemplate(template: string, contact: CampaignContact): string {
  let personalized = template;
  personalized = personalized.replace(/\{\{first_name\}\}/g, contact.first_name || "there");
  personalized = personalized.replace(/\{\{last_name\}\}/g, contact.last_name || "");
  personalized = personalized.replace(/\{\{email\}\}/g, contact.email || "");
  return personalized;
}

async function sendFollowUpEmail(
  supabase: any,
  params: {
    followup_state_id: string;
    campaign_contact_id: string;
    workspace_id: string;
    followup_step: number;
    subject: string;
    body: string;
    contact_email: string;
    contact_name: string | null;
  }
) {
  // Create follow-up message record
  const { data: message, error: messageError } = await supabase
    .from("roofing_followup_messages")
    .insert({
      followup_state_id: params.followup_state_id,
      campaign_contact_id: params.campaign_contact_id,
      workspace_id: params.workspace_id,
      followup_step: params.followup_step,
      subject: params.subject,
      body: params.body,
      status: "pending",
    })
    .select("id")
    .single();

  if (messageError) {
    console.error("Error creating follow-up message:", messageError);
    return;
  }

  try {
    // Get campaign to find sender email
    const { data: state } = await supabase
      .from("roofing_followup_states")
      .select("campaign_id")
      .eq("id", params.followup_state_id)
      .single();

    if (!state) {
      throw new Error("Follow-up state not found");
    }

    // Get campaign details for sender info
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("sender_email, from_email, from_name")
      .eq("id", state.campaign_id)
      .maybeSingle();

    // Get workspace to find connected account
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", params.workspace_id)
      .maybeSingle();

    // Try to send via send-email Edge Function or direct API
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        account_id: null, // Will use default account for workspace
        to: params.contact_email,
        subject: params.subject,
        html: params.body.replace(/\n/g, "<br>"),
        provider: "gmail", // Default to Gmail, can be made configurable
      }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      throw new Error(`Email send failed: ${errorText}`);
    }

    // Mark as sent
    await supabase
      .from("roofing_followup_messages")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", message.id);

    console.log(`[Email Sent] Follow-up ${params.followup_step} to ${params.contact_email}`);
  } catch (error: any) {
    console.error("Error sending email:", error);
    await supabase
      .from("roofing_followup_messages")
      .update({
        status: "failed",
        error_message: error?.message || "Unknown error",
      })
      .eq("id", message.id);
  }
}

