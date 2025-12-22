// Block 458 — Intent Router v2
// Edge Function: ICP Matcher
// AI-driven ICP scoring and routing engine

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type ICPMatcherPayload = {
  lead_id: string;
  workspace_id?: string;
  force_recalculate?: boolean;
};

Deno.serve(async (req) => {
  try {
    const payload: ICPMatcherPayload = await req.json();

    if (!payload.lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get workspace_id from lead if not provided
    let workspaceId = payload.workspace_id;
    if (!workspaceId) {
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", payload.lead_id)
        .single();

      if (leadError || !leadData) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      workspaceId = leadData.workspace_id;
    }

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: "Workspace ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call the route_lead function which handles ICP scoring, priority calculation, and routing
    const { data: routingResult, error: routingError } = await supabase.rpc(
      "route_lead",
      {
        p_lead_id: payload.lead_id,
        p_workspace_id: workspaceId,
        p_force_recalculate: payload.force_recalculate ?? false,
      }
    );

    if (routingError) {
      console.error("Error routing lead:", routingError);
      return new Response(
        JSON.stringify({ 
          error: "Failed to route lead", 
          details: routingError.message 
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Format response according to spec
    const response = {
      icp_score: routingResult?.icp_score ?? 0,
      priority: routingResult?.priority ?? "C",
      best_inboxes: routingResult?.best_inboxes?.map((inbox: any) => inbox.inbox_id) ?? [],
      best_sdrs: routingResult?.best_sdrs?.map((sdr: any) => sdr.sdr_id) ?? [],
      reasons: routingResult?.reasons ?? [],
      assigned_owner_id: routingResult?.assigned_owner_id ?? null,
      assigned_inbox_id: routingResult?.assigned_inbox_id ?? null,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("ICP Matcher error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Internal server error",
        icp_score: 0,
        priority: "C",
        best_inboxes: [],
        best_sdrs: [],
        reasons: ["Error during ICP matching"],
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



