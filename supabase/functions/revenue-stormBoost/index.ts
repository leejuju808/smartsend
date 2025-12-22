// supabase/functions/revenue-stormBoost/index.ts
// Block 16400 — Revenue Engine v2: Calculate Storm Revenue
// Calculates storm revenue potential and recommendations

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // Allow POST and GET (GET for cron triggers)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    let workspace_id: string | null = null;
    let storm_date: string | null = null;
    let storm_type: string | null = null;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      workspace_id = body.workspace_id || null;
      storm_date = body.storm_date || null;
      storm_type = body.storm_type || null;
    } else {
      // GET request - parse query params
      const url = new URL(req.url);
      workspace_id = url.searchParams.get("workspace_id");
      storm_date = url.searchParams.get("storm_date");
      storm_type = url.searchParams.get("storm_type");
    }

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: workspace_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call the database function to calculate storm revenue
    const { data, error } = await supabase.rpc("calculate_storm_revenue", {
      p_workspace_id: workspace_id,
      p_storm_date: storm_date ? new Date(storm_date) : null,
      p_storm_type: storm_type || null,
    });

    if (error) {
      console.error("Error calculating storm revenue:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspace_id,
        storm_revenue: data,
      }),
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





















































