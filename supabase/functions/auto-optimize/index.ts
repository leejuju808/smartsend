// Block 213: Auto-Optimization Engine v1
// Cron job to auto-optimize campaigns with auto_optimize enabled

import { serve } from "https://deno.land/x/sift/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get all campaigns with auto_optimize enabled
  const { data: campaigns, error: fetchError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("auto_optimize", true);

  if (fetchError) {
    console.error("Error fetching campaigns:", fetchError);
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  if (!campaigns || campaigns.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0 }),
      { headers: { "content-type": "application/json" } }
    );
  }

  let processed = 0;
  let errors = 0;

  // Process each campaign
  for (const campaign of campaigns) {
    try {
      // Auto-optimize variant weights
      const { error: optimizeError } = await supabase.rpc("auto_optimize_campaign", {
        cid: campaign.id,
      });

      if (optimizeError) {
        console.error(`Error optimizing campaign ${campaign.id}:`, optimizeError);
        errors++;
        continue;
      }

      // Tune follow-ups
      const { error: tuneError } = await supabase.rpc("tune_followups", {
        cid: campaign.id,
      });

      if (tuneError) {
        console.error(`Error tuning follow-ups for campaign ${campaign.id}:`, tuneError);
        // Don't count this as a failure since variant optimization succeeded
      }

      processed++;
    } catch (err) {
      console.error(`Unexpected error processing campaign ${campaign.id}:`, err);
      errors++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed, errors, total: campaigns.length }),
    { headers: { "content-type": "application/json" } }
  );
});










