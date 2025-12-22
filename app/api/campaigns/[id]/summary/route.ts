import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const id = params.id;

  // sent emails
  const { count: sent } = await supabase
    .from("email_events")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("event_type", "sent");

  // delivered events (optional if you track)
  const { count: delivered } = await supabase
    .from("email_events")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("event_type", "delivered");

  // opens
  const { count: opens } = await supabase
    .from("email_events")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("event_type", "open");

  // clicks
  const { count: clicks } = await supabase
    .from("email_events")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("event_type", "click");

  // bounces
  const { count: bounces } = await supabase
    .from("email_events")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("event_type", "bounce");

  // replies → tied through reply_threads
  // Check for threads with replies (try last_incoming_message_at first, fallback to replied_at)
  const { count: replies } = await supabase
    .from("reply_threads")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", id)
    .or("replied_at.not.is.null,last_incoming_message_at.not.is.null");

  // intent breakdown
  const { data: intentsData } = await supabase
    .from("reply_threads")
    .select("intent_primary")
    .eq("campaign_id", id)
    .not("intent_primary", "is", null);

  // Group intents manually since Supabase doesn't support GROUP BY directly
  const intentCounts: Record<string, number> = {};
  if (intentsData) {
    intentsData.forEach((row) => {
      const intent = row.intent_primary || "other";
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    });
  }
  const intents = Object.entries(intentCounts).map(([intent_primary, count]) => ({
    intent_primary,
    count,
  }));

  // variant stats
  const { data: variants, error: variantsError } = await supabase.rpc("campaign_variant_stats", {
    cid: id,
  });

  // time heatmap events
  const { data: heatmap, error: heatmapError } = await supabase.rpc("campaign_heatmap", {
    cid: id,
  });

  return NextResponse.json({
    sent: sent || 0,
    delivered: delivered || 0,
    opens: opens || 0,
    clicks: clicks || 0,
    replies: replies || 0,
    bounces: bounces || 0,
    intents: intents || [],
    variants: variants || [],
    heatmap: heatmap || [],
  });
}

