// supabase/functions/update-engagement/index.ts
// Nightly cron job to aggregate opens & clicks into campaign open/click rates

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Get all campaigns that have sends
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id")
      .not("id", "is", null);

    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
      return new Response(JSON.stringify({ error: campaignsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ updated: 0, message: "No campaigns found" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let updated = 0;

    for (const campaign of campaigns) {
      const campaignId = campaign.id;

      // Count total sends for this campaign
      // We'll use send_queue as the source of truth for sends
      const { count: totalSends } = await supabase
        .from("send_queue")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "sent");

      if (!totalSends || totalSends === 0) {
        // No sends yet, set rates to 0
        await supabase
          .from("campaigns")
          .update({ open_rate: 0, click_rate: 0 })
          .eq("id", campaignId);
        continue;
      }

      // Count unique opens (distinct lead_ids)
      const { data: openEvents } = await supabase
        .from("email_events")
        .select("lead_id")
        .eq("campaign_id", campaignId)
        .eq("event_type", "open")
        .not("lead_id", "is", null);

      const uniqueOpens = openEvents
        ? new Set(openEvents.map((e) => e.lead_id).filter(Boolean)).size
        : 0;

      // Count unique clicks (distinct lead_ids)
      const { data: clickEvents } = await supabase
        .from("email_events")
        .select("lead_id")
        .eq("campaign_id", campaignId)
        .eq("event_type", "click")
        .not("lead_id", "is", null);

      const uniqueClicks = clickEvents
        ? new Set(clickEvents.map((e) => e.lead_id).filter(Boolean)).size
        : 0;

      // Calculate rates as percentages
      const openRate = totalSends > 0 ? ((uniqueOpens || 0) / totalSends) * 100 : 0;
      const clickRate = totalSends > 0 ? ((uniqueClicks || 0) / totalSends) * 100 : 0;

      // Update campaign with calculated rates
      const { error: updateError } = await supabase
        .from("campaigns")
        .update({
          open_rate: Math.round(openRate * 10) / 10, // Round to 1 decimal place
          click_rate: Math.round(clickRate * 10) / 10,
        })
        .eq("id", campaignId);

      if (updateError) {
        console.error(`Error updating campaign ${campaignId}:`, updateError);
      } else {
        updated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        updated,
        total_campaigns: campaigns.length,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in update-engagement:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

