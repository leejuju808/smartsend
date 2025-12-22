// Block 21728 — SmartSend Roofing Lead Status Brain v1
// Edge Function — Time-Based Status Updates (Cron)
// Automatically updates lead status based on time rules:
// - After 3 days with no reply → downgrade to warm
// - After 7 days with no opens → downgrade to cold
// - If they reopen emails after 7 days → upgrade to warm

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Call the database function to update statuses
    const { data, error } = await supabase.rpc("auto_update_lead_status_by_time");

    if (error) {
      console.error("Failed to update lead statuses:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to update lead statuses",
          details: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get updated leads to log timeline events
    const { data: updatedLeads, error: fetchError } = await supabase
      .from("leads")
      .select("id, status, last_email_sent_at, last_email_opened_at, last_reply_at")
      .or("status.eq.hot,status.eq.warm,status.eq.cold")
      .not("last_email_sent_at", "is", null);

    if (fetchError) {
      console.error("Failed to fetch updated leads:", fetchError);
    }

    // Log timeline events for status changes (optional, can be heavy)
    // For now, we'll skip this to keep the cron lightweight
    // Individual status changes will log their own events

    return new Response(
      JSON.stringify({
        success: true,
        message: "Lead statuses updated based on time rules",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});










































