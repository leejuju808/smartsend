// Block 52000 — SmartSend Roofing Warranty Tracking + Service Call System v1
// Scheduled Function: warranty-check-expirations
// Daily cron job to check warranty expirations and send alerts
// Called by Supabase cron: "0 6 * * *" (Daily at 6 AM UTC)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  try {
    // Call the warranty check-expirations edge function
    const response = await fetch(
      `${supabaseUrl}/functions/v1/warranty/check-expirations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
        },
        body: JSON.stringify({}),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Error checking warranty expirations:", result);
      return new Response(
        JSON.stringify({ error: result.error || "Failed to check expirations" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        checked_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in warranty-check-expirations scheduled function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
































