// Block 29110 — SmartSend Roofing "AI Inbox + Intent Brain" v1
// Intent-Based Workflow Router
// Triggers appropriate workflows based on classified intent

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { lead_id, intent, message_id } = await req.json();

    if (!lead_id || !intent) {
      return new Response(
        JSON.stringify({ error: "lead_id and intent are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const actions: string[] = [];

    // Route based on intent
    switch (intent) {
      case "hot_lead":
        {
          const { error } = await supabase.rpc("mark_priority_lead", {
            p_lead_id: lead_id,
          });
          if (!error) actions.push("marked_priority_lead");
        }
        break;

      case "appointment_request":
        {
          const { error } = await supabase.rpc("send_booking_link", {
            p_lead_id: lead_id,
          });
          if (!error) actions.push("triggered_booking_link");
        }
        break;

      case "price_question":
        {
          const { error } = await supabase.rpc("send_pricing_info", {
            p_lead_id: lead_id,
          });
          if (!error) actions.push("triggered_pricing_info");
        }
        break;

      case "follow_up_required":
        {
          // Schedule follow-up for 7 days from now
          const followupDate = new Date();
          followupDate.setDate(followupDate.getDate() + 7);
          
          const { error } = await supabase.rpc("schedule_followup", {
            p_lead_id: lead_id,
            p_followup_date: followupDate.toISOString(),
          });
          if (!error) actions.push("scheduled_followup");
        }
        break;

      case "not_interested":
        {
          const { error } = await supabase.rpc("archive_lead", {
            p_lead_id: lead_id,
          });
          if (!error) actions.push("archived_lead");
          
          // Optionally pause sequences for this lead
          // This would require additional logic to find and pause active sequences
        }
        break;

      case "referral":
        {
          const { error } = await supabase.rpc("log_referral_intent", {
            p_lead_id: lead_id,
          });
          if (!error) actions.push("logged_referral");
        }
        break;

      case "warm_lead":
      case "general":
        // These don't trigger specific workflows, but could be logged
        actions.push("no_action_required");
        break;

      default:
        actions.push("unknown_intent_no_action");
    }

    // Update lead's last intent if lead exists
    if (lead_id) {
      await supabase
        .from("leads")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead_id)
        .catch(err => console.error("Error updating lead:", err));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        intent,
        lead_id,
        actions,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in intent-router:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
