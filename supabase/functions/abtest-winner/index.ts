// supabase/functions/abtest-winner/index.ts
// Auto-winner detection for A/B testing
// Runs daily to select winning variant based on reply rate

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

serve(async () => {
  try {
    // Get all campaigns with variants
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id")
      .not("status", "eq", "draft");

    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
      return new Response(
        JSON.stringify({ ok: false, error: campaignsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;

    for (const campaign of campaigns) {
      // Get all variants for this campaign
      const { data: variants, error: variantsError } = await supabase
        .from("template_variants")
        .select("id, name, sends, replies")
        .eq("campaign_id", campaign.id);

      if (variantsError || !variants || variants.length === 0) {
        continue;
      }

      // Find winner: variant with highest reply rate (minimum 50 sends)
      let winner: { id: string; rate: number } | null = null;
      let bestRate = 0;

      for (const variant of variants) {
        if (variant.sends >= 50) {
          const rate = variant.replies / variant.sends;
          if (rate > bestRate) {
            bestRate = rate;
            winner = { id: variant.id, rate };
          }
        }
      }

      // Update campaign with winner if found
      if (winner) {
        const { error: updateError } = await supabase
          .from("campaigns")
          .update({ winner_variant_id: winner.id })
          .eq("id", campaign.id);

        if (updateError) {
          console.error(
            `Error updating winner for campaign ${campaign.id}:`,
            updateError
          );
        } else {
          processed++;
          console.log(
            `Campaign ${campaign.id}: Winner is variant ${winner.id} (${(winner.rate * 100).toFixed(2)}% reply rate)`
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in abtest-winner:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});










