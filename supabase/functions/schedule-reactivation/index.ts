// Block 28412 — SmartSend Roofing Past Customer Reactivation Engine v1
// Edge Function: Schedule Reactivation Events
// Generates reactivation events for past customers based on time windows

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get workspace_id from query params if provided (optional - can process all)
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspace_id");
    
    // Call the database function to generate reactivation events
    const { data, error } = await supabase.rpc("generate_reactivation_events", {
      p_workspace_id: workspaceId || null,
    });
    
    if (error) {
      console.error("Error generating reactivation events:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    
    const result = Array.isArray(data) && data.length > 0 ? data[0] : { events_created: 0, customers_processed: 0 };
    
    return new Response(
      JSON.stringify({
        ok: true,
        events_created: result.events_created || 0,
        customers_processed: result.customers_processed || 0,
        message: `Generated ${result.events_created || 0} reactivation events from ${result.customers_processed || 0} customers`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


































