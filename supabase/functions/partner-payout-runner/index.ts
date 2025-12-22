import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logErrorToMonitors } from "../_shared/monitoring.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async () => {
  try {
    console.log("Partner Payout Runner: Starting monthly payout processing");

    // Get all pending payouts
    const { data: payouts, error: payoutsError } = await supabase
      .from("partner_payouts")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (payoutsError) {
      console.error("Error fetching payouts:", payoutsError);
      await logErrorToMonitors("partner-payout-runner", payoutsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch payouts" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!payouts || payouts.length === 0) {
      console.log("No pending payouts found");
      return new Response(
        JSON.stringify({ ok: true, message: "No payouts to process" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${payouts.length} pending payouts`);

    let processed = 0;
    let failed = 0;

    // Process each payout
    for (const payout of payouts) {
      try {
        // In a production system, you would:
        // 1. Create a transfer in Stripe/PayPal/etc.
        // 2. Get the payment reference ID
        // 3. Update the payout record with the reference
        
        // For now, we'll simulate this by just marking as paid
        console.log(`Processing payout: $${payout.amount} for partner ${payout.partner_id} (${payout.period})`);

        // Example: Log payout details instead of actual processing
        // In production, you would integrate with a payment provider here
        // e.g., Stripe Connect, PayPal, bank transfer, etc.
        
        const { error: updateError } = await supabase
          .from("partner_payouts")
          .update({ 
            status: "paid",
            updated_at: new Date().toISOString()
          })
          .eq("id", payout.id);

        if (updateError) {
          console.error(`Error updating payout ${payout.id}:`, updateError);
          failed++;
        } else {
          console.log(`Successfully processed payout ${payout.id}`);
          processed++;
        }
      } catch (error) {
        console.error(`Error processing payout ${payout.id}:`, error);
        await logErrorToMonitors("partner-payout-runner", error, { payout_id: payout.id });
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: payouts.length,
        processed,
        failed
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in partner-payout-runner:", error);
    await logErrorToMonitors("partner-payout-runner", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

