import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function evalCampaign(campaignId: string, variant: string) {
  const { data: camp } = await db
    .from("campaigns")
    .select("ab_autopromote, ab_min_samples, ab_promotion_delta")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp?.ab_autopromote) return;

  const { data: split } = await db
    .from("variant_split")
    .select("template_version_id, weight")
    .eq("campaign_id", campaignId)
    .eq("variant_key", variant);
  if (!split || split.length < 2) return;

  // Get stats last 14 days
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const ids = split.map((s) => s.template_version_id);

  // Get sent counts
  const { data: sentData } = await db
    .from("send_logs")
    .select("template_version_id")
    .eq("campaign_id", campaignId)
    .in("template_version_id", ids)
    .gte("sent_at", since);

  // Count sends per version
  const sentCounts = new Map<string, number>();
  for (const s of sentData ?? []) {
    if (!s.template_version_id) continue;
    sentCounts.set(
      s.template_version_id,
      (sentCounts.get(s.template_version_id) ?? 0) + 1
    );
  }

  // Get replies using the RPC function if available, otherwise query directly
  let repliesData: any[] = [];
  try {
    const { data: rpcData } = await db.rpc("analytics_replies_by_variant_version", {
      c_id: campaignId,
      since_ts: since,
    });
    repliesData = rpcData ?? [];
  } catch {
    // Fallback: query send_logs directly for replies
    const { data: directReplies } = await db
      .from("send_logs")
      .select("template_version_id")
      .eq("campaign_id", campaignId)
      .in("template_version_id", ids)
      .gte("sent_at", since)
      .eq("status", "replied");
    repliesData =
      directReplies?.map((r) => ({
        template_version_id: r.template_version_id,
        count: 1,
      })) ?? [];
  }

  // Count replies per version
  const replyCounts = new Map<string, number>();
  for (const r of repliesData) {
    const vid = r.template_version_id;
    if (!vid || !ids.includes(vid)) continue;
    replyCounts.set(vid, (replyCounts.get(vid) ?? 0) + (r.count ?? 1));
  }

  // Build stats array
  const stats = ids.map((id) => {
    const sent = sentCounts.get(id) ?? 0;
    const replies = replyCounts.get(id) ?? 0;
    return {
      id,
      sent,
      reply: sent > 0 ? replies / sent : 0,
    };
  });

  // Check thresholds
  if (stats.some((s) => s.sent < camp.ab_min_samples)) return;

  // Find winner by reply rate
  const sorted = [...stats].sort((a, b) => b.reply - a.reply);
  const lead = sorted[0];
  const second = sorted[1];
  if (!second) return;
  if (lead.reply - second.reply < camp.ab_promotion_delta) return;

  // Promote winner: set active, clear split
  await db.from("variant_active_version").upsert({
    campaign_id: campaignId,
    variant_key: variant,
    template_version_id: lead.id,
  });
  await db
    .from("template_versions")
    .update({ is_active: false })
    .eq("campaign_id", campaignId)
    .eq("variant_key", variant);
  await db
    .from("template_versions")
    .update({ is_active: true })
    .eq("id", lead.id);
  await db
    .from("variant_split")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("variant_key", variant);

  // Log activity
  try {
    await db.from("activity_logs").insert({
      campaign_id: campaignId,
      lead_id: null,
      event_type: "variant_autopromote",
      meta: {
        variant,
        winner: lead.id,
        winner_reply: lead.reply,
        second: second.id,
        second_reply: second.reply,
      },
    });
  } catch {
    // activity_logs might not exist, continue
  }
}

serve(async (_req) => {
  try {
    // Iterate campaigns with splits
    const { data: rows } = await db
      .from("variant_split")
      .select("campaign_id, variant_key")
      .order("campaign_id");

    const uniq = new Map<string, Set<string>>();
    for (const r of rows ?? []) {
      if (!uniq.has(r.campaign_id)) {
        uniq.set(r.campaign_id, new Set());
      }
      uniq.get(r.campaign_id)!.add(r.variant_key);
    }

    for (const [cid, set] of uniq) {
      for (const v of set) {
        await evalCampaign(cid, v);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});

