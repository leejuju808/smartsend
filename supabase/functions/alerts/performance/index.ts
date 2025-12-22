import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface PerformanceAlertPayload {
  workspace_id: string;
  metric_type: 'high_opens' | 'high_replies' | 'high_value_lead' | 'insurance_revenue' | 'storm_wave';
  value: number;
  details?: string;
  campaign_id?: string;
  metadata?: Record<string, any>;
}

Deno.serve(async (req) => {
  try {
    const payload: PerformanceAlertPayload = await req.json();

    if (!payload.workspace_id || !payload.metric_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get workspace members
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", payload.workspace_id);

    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify({ error: "No workspace members found" }),
        { status: 404 }
      );
    }

    // Create alert messages based on metric type
    let title = "";
    let message = "";

    switch (payload.metric_type) {
      case "high_opens":
        title = "📈 High Engagement Detected";
        message = payload.details || `${payload.value} homeowners opened your email in the last hour — great momentum!`;
        break;
      case "high_replies":
        title = "💬 Reply Surge";
        message = payload.details || `${payload.value} replies received — high engagement!`;
        break;
      case "high_value_lead":
        title = "💰 High-Value Lead Detected";
        message = payload.details || `New lead with estimated value of $${payload.value.toLocaleString()}`;
        break;
      case "insurance_revenue":
        title = "💰 New Insurance Opportunity";
        message = payload.details || `New $${payload.value.toLocaleString()} insurance opportunity detected.`;
        break;
      case "storm_wave":
        title = "🌪️ Storm Wave Detected";
        message = payload.details || `Storm activity detected in your area — ${payload.value} potential leads.`;
        break;
      default:
        title = "📈 Performance Update";
        message = payload.details || `Campaign performance update: ${payload.value}`;
    }

    // Create workspace-wide alerts (in-app only, low priority)
    const { data: alertId, error: alertError } = await supabase.rpc("create_alert", {
      p_workspace_id: payload.workspace_id,
      p_user_id: null, // workspace-wide
      p_type: "performance_insights",
      p_title: title,
      p_message: message,
      p_campaign_id: payload.campaign_id || null,
      p_metadata: {
        metric_type: payload.metric_type,
        value: payload.value,
        ...payload.metadata,
      },
      p_source: "performance_monitor",
    });

    if (alertError) {
      console.error("Error creating alert:", alertError);
      return new Response(
        JSON.stringify({ error: "Failed to create alert", details: alertError.message }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, alert_id: alertId }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in alerts/performance:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































