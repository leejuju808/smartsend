// supabase/functions/job_health_refresh/index.ts
// Block 21570 — Job Health Refresh Edge Function
// Allows the app to trigger job health score refresh for a user or workspace

import { serve } from "https://deno.land/x/sift@0.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve({
  "/": async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const body = await req.json().catch(() => null);
      const userId = body?.user_id;
      const workspaceId = body?.workspace_id;

      // Require either user_id or workspace_id
      if (!userId && !workspaceId) {
        return new Response(
          JSON.stringify({ error: "Missing user_id or workspace_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Call the appropriate refresh function
      let result;
      if (userId) {
        const { error } = await supabase.rpc("refresh_job_health_for_user", {
          p_user_id: userId,
        });

        if (error) {
          console.error("job_health_refresh error (user):", error);
          return new Response(
            JSON.stringify({ error: "Failed to refresh job health scores", details: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        result = { success: true, refreshed_for: "user", user_id: userId };
      } else {
        const { error } = await supabase.rpc("refresh_job_health_for_workspace", {
          p_workspace_id: workspaceId,
        });

        if (error) {
          console.error("job_health_refresh error (workspace):", error);
          return new Response(
            JSON.stringify({ error: "Failed to refresh job health scores", details: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        result = { success: true, refreshed_for: "workspace", workspace_id: workspaceId };
      }

      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("job_health_refresh unexpected error:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
});














































