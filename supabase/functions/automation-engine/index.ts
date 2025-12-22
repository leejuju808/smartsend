// Block 23000 — SmartSend Roofing Automation Engine v1
// Edge Function: /automation-engine
// 
// This is the central worker that processes automation events.
// Pattern: Polls automation_events table, matches to automations, executes actions.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1️⃣ Fetch unprocessed events (limit to prevent overload)
    const { data: events, error: eventsError } = await supabase
      .from("automation_events")
      .select("*")
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (eventsError) throw eventsError;
    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "no events" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    for (const event of events) {
      const { id: eventId, workspace_id, event_type, payload } = event;

      // 2️⃣ Get automations for this workspace + event type
      const { data: automations, error: autoError } = await supabase
        .from("automations")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("trigger_event", event_type)
        .eq("is_active", true);

      if (autoError) throw autoError;

      for (const automation of automations || []) {
        try {
          // 3️⃣ Evaluate condition (simple V1 logic)
          if (!passesCondition(automation.condition, payload)) {
            continue;
          }

          // 4️⃣ Execute actions
          for (const action of automation.actions || []) {
            await executeAction(
              action,
              payload,
              workspace_id,
              automation.id
            );
          }

          // 5️⃣ Log success
          await supabase.from("automation_logs").insert({
            workspace_id,
            automation_id: automation.id,
            trigger_event: event_type,
            target_type: payload.target_type,
            target_id: payload.target_id,
            status: "success",
            message: "Automation executed",
          });
        } catch (err: any) {
          console.error("Automation error", err);
          await supabase.from("automation_logs").insert({
            workspace_id,
            automation_id: automation.id,
            trigger_event: event_type,
            target_type: payload.target_type,
            target_id: payload.target_id,
            status: "error",
            message: String(err?.message || err),
          });
        }
      }

      // 6️⃣ Mark event processed
      await supabase
        .from("automation_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", eventId);
    }

    return new Response(
      JSON.stringify({ ok: true, processed: events.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Simple condition evaluator
function passesCondition(condition: any, payload: any): boolean {
  if (!condition) return true;

  // Example: { "field": "invoice.status", "equals": "sent" }
  const { field, equals, not_equals, age_days_gt } = condition;

  let value: any = null;
  if (field) {
    value = field.split(".").reduce((acc: any, key: string) => acc?.[key], payload);
  }

  if (equals !== undefined && value !== equals) return false;
  if (not_equals !== undefined && value === not_equals) return false;

  if (age_days_gt !== undefined && payload.created_at) {
    const created = new Date(payload.created_at);
    const now = new Date();
    const ageDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (!(ageDays > age_days_gt)) return false;
  }

  return true;
}

// Action executor
async function executeAction(
  action: any,
  payload: any,
  workspace_id: string,
  automation_id: string
) {
  const type = action.type;

  if (type === "send_email") {
    // TODO: integrate with your email sender (Resend, Postmark, etc. later)
    // payload needs homeowner email, template, etc.
    console.log("Would send email", action.template, "with payload", payload);
    return;
  }

  if (type === "create_production_alert") {
    await supabase.from("production_alerts").insert({
      workspace_id,
      job_id: payload.job_id,
      crew_id: payload.crew_id || null,
      type: action.alert_type || "schedule_change",
      severity: action.severity || "warning",
      message: action.message || "Automated alert.",
    });
    return;
  }

  if (type === "update_job_flag") {
    await supabase
      .from("roofing_jobs")
      .update({
        attention_required: true,
      })
      .eq("id", payload.job_id)
      .eq("workspace_id", workspace_id);
    return;
  }

  if (type === "create_ai_insight") {
    await supabase.from("ai_insights").insert({
      workspace_id,
      job_id: payload.job_id,
      category: action.category || "general_insight",
      severity: action.severity || "info",
      message: action.message,
      recommendation: action.recommendation,
    });
    return;
  }

  if (type === "create_notification") {
    // Create in-app notification for owner / role
    // Note: This assumes you have a notifications table
    // If not, you might want to use the alerts table or create a notifications table
    console.log("Would create notification", action.message, "for", workspace_id);
    return;
  }

  if (type === "update_job_status") {
    if (action.status && payload.job_id) {
      await supabase
        .from("roofing_jobs")
        .update({ status: action.status })
        .eq("id", payload.job_id)
        .eq("workspace_id", workspace_id);
    }
    return;
  }

  if (type === "update_job_tag") {
    // Note: This assumes you have a job_tags or similar table
    // Adjust based on your actual schema
    console.log("Would update job tag", action.tag, "for job", payload.job_id);
    return;
  }
}
