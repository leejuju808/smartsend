// supabase/functions/dashboard-calc/index.ts
// Block 10200 — SmartSend Conversion Dashboard Calculator
// Calculates dashboard metrics for a workspace/user

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { workspace_id, user_id } = body;

    if (!workspace_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: workspace_id and user_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call the database function to calculate metrics
    const { data, error } = await supabase.rpc("calculate_dashboard_metrics", {
      p_workspace_id: workspace_id,
      p_user_id: user_id,
    });

    if (error) {
      console.error("Error calculating dashboard metrics:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch the updated metrics
    const { data: metrics, error: fetchError } = await supabase
      .from("dashboard_metrics")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user_id)
      .single();

    if (fetchError) {
      console.error("Error fetching dashboard metrics:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, metrics }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});























































