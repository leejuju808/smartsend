import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface BillingAlertPayload {
  workspace_id: string;
  issue_type: 'payment_failed' | 'trial_ending' | 'over_limit' | 'campaign_paused' | 'domain_health_low';
  details?: string;
  metadata?: Record<string, any>;
}

Deno.serve(async (req) => {
  try {
    const payload: BillingAlertPayload = await req.json();

    if (!payload.workspace_id || !payload.issue_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get workspace owner/admin members
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", payload.workspace_id)
      .in("role", ["owner", "admin"]);

    if (!members || members.length === 0) {
      // Fallback to all members if no admin/owner
      const { data: allMembers } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", payload.workspace_id);

      if (!allMembers || allMembers.length === 0) {
        return new Response(
          JSON.stringify({ error: "No workspace members found" }),
          { status: 404 }
        );
      }

      members.push(...allMembers.map(m => ({ user_id: m.user_id, role: "member" })));
    }

    // Create alert messages based on issue type
    let title = "";
    let message = "";

    switch (payload.issue_type) {
      case "payment_failed":
        title = "⚠️ Billing Failed — Update card to keep campaigns running";
        message = payload.details || "Your payment method failed. Update your card to continue sending emails.";
        break;
      case "trial_ending":
        title = "⏰ Trial Ending Soon";
        message = payload.details || "Your trial ends soon. Subscribe to continue using SmartSend.";
        break;
      case "over_limit":
        title = "⚠️ Send Limit Reached";
        message = payload.details || "You've reached your sending limit. Upgrade to send more emails.";
        break;
      case "campaign_paused":
        title = "⏸️ Campaign Paused";
        message = payload.details || "Your campaign has been paused due to billing or system issues.";
        break;
      case "domain_health_low":
        title = "⚠️ Domain Health Low — Sending slowed to protect your domain";
        message = payload.details || "Your domain reputation is low. Sending has been slowed to protect deliverability.";
        break;
      default:
        title = "⚠️ System Alert";
        message = payload.details || "A system issue requires your attention.";
    }

    // Create workspace-wide alerts (user_id = null)
    const { data: alertId, error: alertError } = await supabase.rpc("create_alert", {
      p_workspace_id: payload.workspace_id,
      p_user_id: null, // workspace-wide
      p_type: "system_billing",
      p_title: title,
      p_message: message,
      p_metadata: {
        issue_type: payload.issue_type,
        ...payload.metadata,
      },
      p_source: "billing_system",
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
    console.error("Error in alerts/billingIssues:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































