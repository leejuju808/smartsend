// Block 181: Reputation Recompute Edge Function
// Runs hourly to recalculate reputation scores based on bounce rates, unsubscribe surges, and send volume

import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async () => {
  try {
    console.log("Starting reputation recomputation...");

    // Get all deliverability stats
    const { data: stats, error: fetchError } = await supabase
      .from("deliverability_stats")
      .select("*");

    if (fetchError) {
      console.error("Error fetching deliverability stats:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!stats || stats.length === 0) {
      console.log("No deliverability stats found");
      return new Response(
        JSON.stringify({ ok: true, processed: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let updated = 0;

    for (const s of stats) {
      let score = 100;

      // Calculate bounce rate
      const bounceRate = s.sent_24h > 0 
        ? (s.bounces_24h / s.sent_24h) * 100 
        : 0;

      // Bounce rate penalty
      if (bounceRate > 8) {
        score -= 30; // Critical: bounce rate > 8%
      } else if (bounceRate > 5) {
        score -= 20; // High: bounce rate > 5%
      } else if (bounceRate > 3) {
        score -= 10; // Moderate: bounce rate > 3%
      }

      // Absolute bounce count penalties
      if (s.bounces_24h > 20) {
        score -= 25; // Severe bounce spike
      } else if (s.bounces_24h > 10) {
        score -= 10; // Moderate bounce spike
      }

      // Unsubscribe surge detection
      const unsubscribeRate = s.sent_24h > 0 
        ? (s.unsubscribes_24h / s.sent_24h) * 100 
        : 0;

      if (unsubscribeRate > 2) {
        score -= 15; // High unsubscribe rate
      } else if (s.unsubscribes_24h > 10) {
        score -= 10; // Unsubscribe surge (>10 in 24h)
      }

      // Complaint signals (future)
      if (s.complaints_24h > 3) {
        score -= 25; // Multiple complaints
      } else if (s.complaints_24h > 1) {
        score -= 10; // Single complaint
      }

      // Bulk send penalty (too many emails in 24h)
      if (s.sent_24h > 800) {
        score -= 20; // Very high volume
      } else if (s.sent_24h > 400) {
        score -= 10; // High volume
      }

      // Clamp score between 0 and 100
      if (score < 0) score = 0;
      if (score > 100) score = 100;

      // Only update if score changed
      if (score !== s.reputation_score) {
        const { error: updateError } = await supabase
          .from("deliverability_stats")
          .update({ reputation_score: score })
          .eq("id", s.id);

        if (updateError) {
          console.error(`Error updating reputation for ${s.domain}:`, updateError);
        } else {
          updated++;
          console.log(
            `Updated reputation for ${s.domain}: ${s.reputation_score} -> ${score} ` +
            `(bounces: ${s.bounces_24h}/${s.sent_24h}, unsubs: ${s.unsubscribes_24h}, complaints: ${s.complaints_24h})`
          );
        }
      }

      processed++;
    }

    console.log(`Reputation recomputation complete. Processed: ${processed}, Updated: ${updated}`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        processed, 
        updated,
        timestamp: new Date().toISOString()
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in reputation recomputation:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});












