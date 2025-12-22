import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface AgentTriggerRequest {
  org_id: string;
  trigger_type: "lead_reply" | "lead_qualified" | "workflow_completed" | "task_created";
  source_module: "smartsend" | "opsgrid" | "agentcloud";
  resource_id: string;
  resource_type: string;
  metadata?: Record<string, any>;
}

serve(async (req) => {
  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    const cronToken = req.headers.get("x-cron-token");
    const aurevSyncKey = req.headers.get("x-aurev-sync");
    
    if (!authHeader && cronToken !== Deno.env.get("CRON_SECRET") && 
        aurevSyncKey !== Deno.env.get("AUREV_SYNC_KEY")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const body: AgentTriggerRequest = await req.json();
    const { org_id, trigger_type, source_module, resource_id, resource_type, metadata } = body;

    if (!org_id || !trigger_type || !source_module || !resource_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    // Store the event in aurev_events
    const { data: event, error: eventError } = await supabase
      .from("aurev_events")
      .insert({
        org_id,
        event_type: trigger_type,
        module: source_module,
        resource_type,
        resource_id,
        payload: metadata || {},
        triggered_by: null // System-triggered
      })
      .select()
      .single();

    if (eventError) {
      console.error("Error storing event:", eventError);
      return new Response(JSON.stringify({ error: eventError.message }), { status: 500 });
    }

    // Route to appropriate automation based on trigger type
    const results = await handleTrigger(org_id, trigger_type, source_module, resource_id, metadata);

    return new Response(
      JSON.stringify({
        success: true,
        event_id: event.id,
        actions_triggered: results,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in agent_trigger function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
});

async function handleTrigger(
  orgId: string,
  triggerType: string,
  sourceModule: string,
  resourceId: string,
  metadata?: Record<string, any>
): Promise<Array<{ action: string; success: boolean; details?: any }>> {
  const results: Array<{ action: string; success: boolean; details?: any }> = [];

  // SmartSend → Agent Cloud: Auto follow-up on lead reply
  if (sourceModule === "smartsend" && triggerType === "lead_reply") {
    try {
      // Get SmartSend thread data
      const { data: thread } = await supabase
        .from("email_threads")
        .select("lead_email, subject, thread_id, org_id")
        .eq("id", resourceId)
        .single();

      if (thread) {
        // Trigger Agent Cloud automation
        const agentCloudUrl = Deno.env.get("AGENTCLOUD_API_URL") || "https://agentcloudapp.com/api/automations/execute";
        const response = await fetch(agentCloudUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("AUREV_SYNC_KEY")}`
          },
          body: JSON.stringify({
            org_id: orgId,
            automation_type: "auto_followup",
            trigger: "lead_replied",
            context: {
              lead_email: thread.lead_email,
              subject: thread.subject,
              thread_id: thread.thread_id
            }
          })
        });

        if (response.ok) {
          results.push({ action: "agent_cloud_auto_followup", success: true });
        } else {
          results.push({ action: "agent_cloud_auto_followup", success: false });
        }
      }
    } catch (error) {
      console.error("Auto follow-up failed:", error);
      results.push({ action: "agent_cloud_auto_followup", success: false });
    }
  }

  // OpsGrid → SmartSend: Auto-create campaign when workflow completes
  if (sourceModule === "opsgrid" && triggerType === "workflow_completed") {
    try {
      // Get workflow details
      const workflowType = metadata?.workflow_type;
      
      if (workflowType === "lead_nurture") {
        const smartsendUrl = Deno.env.get("SMARTSEND_API_URL") || "https://smartsendhq.com/api/campaigns/create";
        const response = await fetch(smartsendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("AUREV_SYNC_KEY")}`
          },
          body: JSON.stringify({
            org_id: orgId,
            name: metadata?.campaign_name || "Auto-campaign",
            auto_create: true
          })
        });

        if (response.ok) {
          results.push({ action: "smartsend_auto_campaign", success: true });
        } else {
          results.push({ action: "smartsend_auto_campaign", success: false });
        }
      }
    } catch (error) {
      console.error("Auto campaign creation failed:", error);
      results.push({ action: "smartsend_auto_campaign", success: false });
    }
  }

  return results;
}

