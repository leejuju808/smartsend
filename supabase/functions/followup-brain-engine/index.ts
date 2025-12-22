// Block 10600 — SmartSend Auto-Follow-Up Brain v1
// The Behavior Engine That Keeps Roof Leads Alive Until They Convert
// Runs every hour to check and execute follow-up actions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FollowUpState {
  id: string;
  lead_id: string;
  workspace_id: string;
  campaign_id: string | null;
  step: number;
  next_action_at: string | null;
  last_action: string | null;
  last_message_sent_at: string | null;
  status: string;
  classification: string | null;
}

interface Lead {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  workspace_id: string;
  classification: string | null;
  unsubscribed: boolean;
}

interface MessageTemplate {
  id: string;
  message_type: string;
  step: number | null;
  subject: string;
  body: string;
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
    const now = new Date().toISOString();

    console.log(`[FollowUp Engine] Starting run at ${now}`);

    // ============================================================
    // 1. NO REPLY AFTER X DAYS → Follow-Up Sequence
    // ============================================================
    const noReplyResults = await processNoReplyFollowUps(supabase, now);
    console.log(`[No Reply] Processed ${noReplyResults.processed} leads`);

    // ============================================================
    // 2. WARM LEAD → Gentle Nurture Message
    // ============================================================
    const warmResults = await processWarmLeads(supabase, now);
    console.log(`[Warm Leads] Processed ${warmResults.processed} leads`);

    // ============================================================
    // 3. HOT LEAD → Stop Campaign + Notify Roofer
    // ============================================================
    const hotResults = await processHotLeads(supabase, now);
    console.log(`[Hot Leads] Processed ${hotResults.processed} leads`);

    // ============================================================
    // 4. NEGATIVE SIGNAL → Suppress Contact
    // ============================================================
    const negativeResults = await processNegativeSignals(supabase, now);
    console.log(`[Negative Signals] Processed ${negativeResults.processed} leads`);

    const totalProcessed =
      noReplyResults.processed +
      warmResults.processed +
      hotResults.processed +
      negativeResults.processed;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Follow-up engine executed successfully`,
        processed: totalProcessed,
        breakdown: {
          no_reply: noReplyResults.processed,
          warm_leads: warmResults.processed,
          hot_leads: hotResults.processed,
          negative_signals: negativeResults.processed,
        },
        timestamp: now,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[FollowUp Engine] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

/**
 * 1. NO REPLY AFTER X DAYS → Follow-Up Sequence
 * Default: Day 0 → Message 1, Day 2 → Message 2, Day 4 → Message 3
 */
async function processNoReplyFollowUps(
  supabase: ReturnType<typeof createClient>,
  now: string
): Promise<{ processed: number }> {
  // Find active follow-up states that need next action
  const { data: states, error } = await supabase
    .from("followup_states")
    .select("*")
    .eq("status", "active")
    .lte("next_action_at", now)
    .is("classification", null) // Not classified as hot/warm
    .limit(100);

  if (error || !states || states.length === 0) {
    return { processed: 0 };
  }

  let processed = 0;

  for (const state of states) {
    try {
      // Check if lead is suppressed
      const { data: suppressed } = await supabase.rpc("is_lead_suppressed", {
        p_lead_id: state.lead_id,
      });

      if (suppressed) {
        // Suppress this lead
        await supabase
          .from("followup_states")
          .update({ status: "suppressed" })
          .eq("id", state.id);
        continue;
      }

      // Get lead info
      const { data: lead } = await supabase
        .from("leads")
        .select("id, email, first_name, last_name, workspace_id")
        .eq("id", state.lead_id)
        .single();

      if (!lead) continue;

      // Get last message timestamp
      const { data: lastMessageTime } = await supabase.rpc(
        "get_lead_last_message_time",
        { p_lead_id: state.lead_id }
      );

      const lastMessageDate = lastMessageTime
        ? new Date(lastMessageTime)
        : new Date(state.created_at);
      const daysSinceLastMessage = Math.floor(
        (new Date(now).getTime() - lastMessageDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      // Determine which step to send based on days
      let targetStep = state.step;
      if (daysSinceLastMessage >= 4 && state.step < 2) {
        targetStep = 2; // Day 4 message
      } else if (daysSinceLastMessage >= 2 && state.step < 1) {
        targetStep = 1; // Day 2 message
      } else if (daysSinceLastMessage >= 0 && state.step === 0) {
        targetStep = 0; // Day 0 message
      } else {
        // Not time yet, update next_action_at
        const nextActionDate = new Date(lastMessageDate);
        if (state.step === 0) {
          nextActionDate.setDate(nextActionDate.getDate() + 2);
        } else if (state.step === 1) {
          nextActionDate.setDate(nextActionDate.getDate() + 2);
        } else {
          // Completed sequence
          await supabase
            .from("followup_states")
            .update({ status: "completed" })
            .eq("id", state.id);
          continue;
        }
        await supabase
          .from("followup_states")
          .update({ next_action_at: nextActionDate.toISOString() })
          .eq("id", state.id);
        continue;
      }

      // Get template for this step
      const { data: template } = await supabase
        .from("followup_message_templates")
        .select("*")
        .eq("message_type", "no_reply")
        .eq("step", targetStep)
        .eq("is_default", true)
        .eq("active", true)
        .single();

      if (!template) {
        console.error(`No template found for step ${targetStep}`);
        continue;
      }

      // Personalize message
      const firstName = lead.first_name || "there";
      const subject = template.subject.replace("{{first_name}}", firstName);
      const body = template.body.replace(/{{first_name}}/g, firstName);

      // Create follow-up message record
      const { data: message, error: msgError } = await supabase
        .from("followup_messages")
        .insert({
          followup_state_id: state.id,
          lead_id: state.lead_id,
          workspace_id: state.workspace_id,
          message_type: "no_reply",
          step: targetStep,
          subject,
          body,
          status: "pending",
        })
        .select("id")
        .single();

      if (msgError || !message) {
        console.error("Failed to create follow-up message:", msgError);
        continue;
      }

      // Send message via send API
      await sendFollowUpMessage(supabase, {
        leadId: state.lead_id,
        workspaceId: state.workspace_id,
        campaignId: state.campaign_id,
        subject,
        body,
        messageId: message.id,
      });

      // Update follow-up state
      const nextStep = targetStep + 1;
      const nextActionDate = new Date();
      if (nextStep === 1) {
        nextActionDate.setDate(nextActionDate.getDate() + 2);
      } else if (nextStep === 2) {
        nextActionDate.setDate(nextActionDate.getDate() + 2);
      }

      await supabase
        .from("followup_states")
        .update({
          step: nextStep,
          last_action: now,
          last_message_sent_at: now,
          next_action_at:
            nextStep < 3 ? nextActionDate.toISOString() : null,
          status: nextStep >= 3 ? "completed" : "active",
        })
        .eq("id", state.id);

      processed++;
    } catch (err) {
      console.error(`Error processing follow-up state ${state.id}:`, err);
    }
  }

  return { processed };
}

/**
 * 2. WARM LEAD → Gentle Nurture Message
 * Sends gentle follow-up when lead shows warm intent
 */
async function processWarmLeads(
  supabase: ReturnType<typeof createClient>,
  now: string
): Promise<{ processed: number }> {
  // Find leads classified as warm that haven't received warm nurture yet
  const { data: states, error } = await supabase
    .from("followup_states")
    .select("*")
    .eq("status", "active")
    .eq("classification", "warm")
    .is("last_message_sent_at", null) // Haven't sent warm message yet
    .limit(50);

  if (error || !states || states.length === 0) {
    return { processed: 0 };
  }

  let processed = 0;

  for (const state of states) {
    try {
      // Check if lead is suppressed
      const { data: suppressed } = await supabase.rpc("is_lead_suppressed", {
        p_lead_id: state.lead_id,
      });

      if (suppressed) {
        await supabase
          .from("followup_states")
          .update({ status: "suppressed" })
          .eq("id", state.id);
        continue;
      }

      // Get lead info
      const { data: lead } = await supabase
        .from("leads")
        .select("id, email, first_name, workspace_id")
        .eq("id", state.lead_id)
        .single();

      if (!lead) continue;

      // Get warm nurture template
      const { data: template } = await supabase
        .from("followup_message_templates")
        .select("*")
        .eq("message_type", "warm_nurture")
        .eq("is_default", true)
        .eq("active", true)
        .single();

      if (!template) continue;

      // Create and send message
      const { data: message } = await supabase
        .from("followup_messages")
        .insert({
          followup_state_id: state.id,
          lead_id: state.lead_id,
          workspace_id: state.workspace_id,
          message_type: "warm_nurture",
          step: 0,
          subject: template.subject,
          body: template.body,
          status: "pending",
        })
        .select("id")
        .single();

      if (message) {
        await sendFollowUpMessage(supabase, {
          leadId: state.lead_id,
          workspaceId: state.workspace_id,
          campaignId: state.campaign_id,
          subject: template.subject,
          body: template.body,
          messageId: message.id,
        });

        await supabase
          .from("followup_states")
          .update({
            last_action: now,
            last_message_sent_at: now,
          })
          .eq("id", state.id);

        processed++;
      }
    } catch (err) {
      console.error(`Error processing warm lead ${state.id}:`, err);
    }
  }

  return { processed };
}

/**
 * 3. HOT LEAD → Stop Campaign + Notify Roofer
 * Stops all follow-ups and sends notification
 */
async function processHotLeads(
  supabase: ReturnType<typeof createClient>,
  now: string
): Promise<{ processed: number }> {
  // Find leads classified as hot that haven't been processed yet
  const { data: states, error } = await supabase
    .from("followup_states")
    .select("*")
    .eq("classification", "hot")
    .in("status", ["active", "paused"])
    .limit(50);

  if (error || !states || states.length === 0) {
    return { processed: 0 };
  }

  let processed = 0;

  for (const state of states) {
    try {
      // Stop all follow-ups
      await supabase
        .from("followup_states")
        .update({
          status: "paused",
          last_action: now,
        })
        .eq("id", state.id);

      // Get lead info
      const { data: lead } = await supabase
        .from("leads")
        .select("id, email, first_name, last_name, workspace_id")
        .eq("id", state.lead_id)
        .single();

      if (!lead) continue;

      // Get workspace owner
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("owner_id")
        .eq("id", state.workspace_id)
        .single();

      if (!workspace) continue;

      // Trigger hot lead notification (use existing notify-hot-lead function)
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const functionUrl = `${supabaseUrl}/functions/v1/notify-hot-lead`;

      await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          lead_id: state.lead_id,
          workspace_id: state.workspace_id,
          source: "followup_brain",
        }),
      });

      processed++;
    } catch (err) {
      console.error(`Error processing hot lead ${state.id}:`, err);
    }
  }

  return { processed };
}

/**
 * 4. NEGATIVE SIGNAL → Suppress Contact
 * Stops all messages and adds to suppression list
 */
async function processNegativeSignals(
  supabase: ReturnType<typeof createClient>,
  now: string
): Promise<{ processed: number }> {
  // Find leads classified as not_interested
  const { data: states, error } = await supabase
    .from("followup_states")
    .select("*")
    .eq("classification", "not_interested")
    .neq("status", "suppressed")
    .limit(50);

  if (error || !states || states.length === 0) {
    return { processed: 0 };
  }

  let processed = 0;

  for (const state of states) {
    try {
      // Get lead email
      const { data: lead } = await supabase
        .from("leads")
        .select("id, email, workspace_id")
        .eq("id", state.lead_id)
        .single();

      if (!lead) continue;

      // Add to suppression list (handle different table structures)
      const { error: suppressError } = await supabase
        .from("suppression_list")
        .upsert({
          email: lead.email.toLowerCase(),
          workspace_id: state.workspace_id,
          reason: "not_interested",
          source: "followup_brain",
        }, {
          onConflict: "email",
        });
      
      // Also try email_suppressions table if it exists
      await supabase
        .from("email_suppressions")
        .upsert({
          email: lead.email.toLowerCase(),
          workspace_id: state.workspace_id,
          reason: "not_interested",
        }, {
          onConflict: "workspace_id,email",
        }).then(() => {}).catch(() => {}); // Ignore errors if table doesn't exist

      // Update lead unsubscribed flag
      await supabase
        .from("leads")
        .update({ unsubscribed: true })
        .eq("id", state.lead_id);

      // Stop follow-up state
      await supabase
        .from("followup_states")
        .update({
          status: "suppressed",
          last_action: now,
        })
        .eq("id", state.id);

      processed++;
    } catch (err) {
      console.error(`Error processing negative signal ${state.id}:`, err);
    }
  }

  return { processed };
}

/**
 * Send follow-up message via send API
 */
async function sendFollowUpMessage(
  supabase: ReturnType<typeof createClient>,
  params: {
    leadId: string;
    workspaceId: string;
    campaignId: string | null;
    subject: string;
    body: string;
    messageId: string;
  }
): Promise<void> {
  try {
    // Get lead email
    const { data: lead } = await supabase
      .from("leads")
      .select("email, workspace_id")
      .eq("id", params.leadId)
      .single();

    if (!lead) {
      await supabase
        .from("followup_messages")
        .update({
          status: "failed",
          error_message: "Lead not found",
        })
        .eq("id", params.messageId);
      return;
    }

    // Get workspace sender email (try multiple possible columns)
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("sender_email, owner_id")
      .eq("id", params.workspaceId)
      .single();

    // Try to get sender email from connected accounts or mailboxes
    let fromEmail = workspace?.sender_email;
    
    if (!fromEmail && workspace?.owner_id) {
      // Try to get from connected accounts
      const { data: account } = await supabase
        .from("connected_accounts")
        .select("provider_email")
        .eq("user_id", workspace.owner_id)
        .eq("provider", "gmail")
        .limit(1)
        .single();
      
      fromEmail = account?.provider_email;
    }

    if (!fromEmail) {
      fromEmail = "noreply@smartsendhq.com";
    }

    // Use enqueue-send function to queue the email
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const enqueueUrl = `${supabaseUrl}/functions/v1/enqueue-send`;
    
    // Get org_id from workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("org_id")
      .eq("id", params.workspaceId)
      .single();
    
    if (!workspace?.org_id) {
      await supabase
        .from("followup_messages")
        .update({
          status: "failed",
          error_message: "Workspace org_id not found",
        })
        .eq("id", params.messageId);
      return;
    }

    const response = await fetch(enqueueUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        org_id: workspace.org_id,
        workspace_id: params.workspaceId,
        campaign_id: params.campaignId,
        lead_id: params.leadId,
        to_email: lead.email,
        subject: params.subject,
        body: params.body,
        connector: "gmail",
      }),
    });

    if (response.ok) {
      // Update message status
      await supabase
        .from("followup_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", params.messageId);
    } else {
      const errorText = await response.text();
      await supabase
        .from("followup_messages")
        .update({
          status: "failed",
          error_message: errorText.slice(0, 500),
        })
        .eq("id", params.messageId);
    }
  } catch (err) {
    console.error("Error sending follow-up message:", err);
    await supabase
      .from("followup_messages")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "Unknown error",
      })
      .eq("id", params.messageId);
  }
}

