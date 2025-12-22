import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logErrorToMonitors } from "../_shared/monitoring.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { event_type, lead_id, org_id } = await req.json();

    if (!event_type || !org_id) {
      return new Response(
        JSON.stringify({ error: "Missing event_type or org_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get all enabled rules matching the event
    const { data: rules, error: rulesError } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("org_id", org_id)
      .eq("trigger_event", event_type)
      .eq("enabled", true);

    if (rulesError) {
      console.error("Error fetching rules:", rulesError);
      await logErrorToMonitors("automation-runner", rulesError, { org_id, event_type });
      return new Response(
        JSON.stringify({ error: "Failed to fetch rules" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const results = [];

    // Execute each matching rule
    for (const rule of rules || []) {
      const action = rule.action?.type;
      const value = rule.action?.value;

      try {
        if (action === "add_tag") {
          await supabase.rpc("add_tag_to_lead", { lead_id, tag: value });
          results.push({ rule_id: rule.id, action, success: true });
        } else if (action === "pause_sequence") {
          const { error: pauseError } = await supabase
            .from("sequence_enrollments")
            .update({ 
              status: "paused_replied", 
              paused_reason: "automation_rule",
              updated_at: new Date().toISOString()
            })
            .eq("lead_id", lead_id);

          if (pauseError) {
            console.error("Error pausing sequence:", pauseError);
            results.push({ rule_id: rule.id, action, success: false, error: pauseError.message });
          } else {
            results.push({ rule_id: rule.id, action, success: true });
          }
        } else if (action === "send_followup") {
          const { error: queueError } = await supabase
            .from("automation_queue")
            .insert({
              lead_id,
              org_id,
              action: "send_followup",
              payload: rule.action,
            });

          if (queueError) {
            console.error("Error queueing follow-up:", queueError);
            results.push({ rule_id: rule.id, action, success: false, error: queueError.message });
          } else {
            results.push({ rule_id: rule.id, action, success: true });
          }
        }
      } catch (error) {
        console.error(`Error executing rule ${rule.id}:`, error);
        results.push({ 
          rule_id: rule.id, 
          action, 
          success: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        rules_processed: results.length,
        results 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in automation-runner:", error);
    await logErrorToMonitors("automation-runner", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

