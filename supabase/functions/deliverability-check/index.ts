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
    console.log("Starting sending health check...");

    // Get all users who have sent emails (have campaigns or send_logs)
    const { data: users, error: usersError } = await supabase
      .from("campaigns")
      .select("user_id")
      .not("user_id", "is", null);

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return new Response(JSON.stringify({ error: usersError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set((users || []).map((u: any) => u.user_id))];

    console.log(`Processing ${uniqueUserIds.length} users`);

    let processed = 0;
    let errors = 0;

    // Process each user
    for (const userId of uniqueUserIds) {
      try {
        // Update sending health metrics
        const { error: updateError } = await supabase.rpc(
          "update_sending_health_metrics",
          { p_user_id: userId }
        );

        if (updateError) {
          console.error(`Error updating metrics for user ${userId}:`, updateError);
          errors++;
          continue;
        }

        processed++;
      } catch (error: any) {
        console.error(`Error processing user ${userId}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors,
        total: uniqueUserIds.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in deliverability-check:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});























































