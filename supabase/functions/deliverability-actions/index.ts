// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async () => {
  try {
    console.log("Starting safety rule enforcement...");

    // Get all users with sending_health records
    const { data: healthRecords, error: healthError } = await supabase
      .from("sending_health")
      .select("user_id");

    if (healthError) {
      console.error("Error fetching health records:", healthError);
      return new Response(JSON.stringify({ error: healthError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${(healthRecords || []).length} users`);

    let paused = 0;
    let safeModeEnabled = 0;
    let errors = 0;

    // Process each user
    for (const record of healthRecords || []) {
      try {
        const userId = record.user_id;

        // 1. Enforce bounce rate safety (auto-pause if >5%)
        const { data: bouncePaused, error: bounceError } = await supabase.rpc(
          "enforce_bounce_rate_safety",
          { p_user_id: userId }
        );

        if (bounceError) {
          console.error(`Error enforcing bounce safety for user ${userId}:`, bounceError);
        } else if (bouncePaused) {
          paused++;
          console.log(`Paused user ${userId} due to high bounce rate`);
        }

        // 2. Enforce complaint rate safety (auto-pause if >0.5%)
        const { data: complaintPaused, error: complaintError } = await supabase.rpc(
          "enforce_complaint_rate_safety",
          { p_user_id: userId }
        );

        if (complaintError) {
          console.error(`Error enforcing complaint safety for user ${userId}:`, complaintError);
        } else if (complaintPaused) {
          paused++;
          console.log(`Paused user ${userId} due to high complaint rate`);
        }

        // 3. Enforce safe mode (for new domains or missing DNS)
        const { data: safeModeChanged, error: safeModeError } = await supabase.rpc(
          "enforce_safe_mode",
          { p_user_id: userId }
        );

        if (safeModeError) {
          console.error(`Error enforcing safe mode for user ${userId}:`, safeModeError);
        } else if (safeModeChanged) {
          safeModeEnabled++;
          console.log(`Safe mode changed for user ${userId}`);
        }
      } catch (error: any) {
        console.error(`Error processing user ${record.user_id}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: (healthRecords || []).length,
        paused,
        safeModeEnabled,
        errors,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in deliverability-actions:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});























































