// Block 74000 — SmartSend Roofing
// "Owner Command Center + Daily Money Dashboard" v1
// Daily Snapshot Generator - Runs at 2 AM daily

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all active workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id");

    if (workspacesError) {
      throw workspacesError;
    }

    const results = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateStr = today.toISOString().split("T")[0];

    // Generate snapshot for each workspace
    for (const workspace of workspaces || []) {
      try {
        const { data: snapshotId, error: snapshotError } = await supabase.rpc(
          "generate_daily_snapshot",
          {
            p_workspace_id: workspace.id,
            p_company_id: null,
            p_date: dateStr,
          }
        );

        if (snapshotError) {
          console.error(
            `Error generating snapshot for workspace ${workspace.id}:`,
            snapshotError
          );
          results.push({
            workspace_id: workspace.id,
            success: false,
            error: snapshotError.message,
          });
        } else {
          results.push({
            workspace_id: workspace.id,
            success: true,
            snapshot_id: snapshotId,
          });
        }
      } catch (err: any) {
        console.error(
          `Exception generating snapshot for workspace ${workspace.id}:`,
          err
        );
        results.push({
          workspace_id: workspace.id,
          success: false,
          error: err.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: dateStr,
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Daily snapshot generation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});



























