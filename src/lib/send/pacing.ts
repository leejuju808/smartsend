import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Returns remaining sends for campaign + per-variant within the last rolling hour.
 * If no override exists, uses campaign.variant_hourly_cap.
 */
export async function pacingRemaining(campaignId: string, variants: string[]) {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [{ data: camp }, { data: vp }] = await Promise.all([
    sb
      .from("campaigns")
      .select("variant_hourly_cap, campaign_hourly_cap")
      .eq("id", campaignId)
      .maybeSingle(),
    sb
      .from("variant_pacing")
      .select("variant_key, hourly_cap")
      .eq("campaign_id", campaignId)
      .in("variant_key", variants.length > 0 ? variants : ["default"]),
  ]);

  // campaign total in last hour
  const { count: sentCampaignLastHour } = await sb
    .from("send_logs")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .gte("sent_at", since)
    .not("sent_at", "is", null);

  // per-variant last hour counts
  const out: Record<
    string,
    { hourlyCap: number; sent: number; remaining: number }
  > = {};

  const variantKeysToCheck = variants.length > 0 ? variants : ["default"];

  await Promise.all(
    variantKeysToCheck.map(async (v) => {
      const cap =
        vp?.find((x) => x.variant_key === v)?.hourly_cap ??
        camp?.variant_hourly_cap ??
        200;

      const { count } = await sb
        .from("send_logs")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("variant_key", v)
        .gte("sent_at", since)
        .not("sent_at", "is", null);

      const sent = count ?? 0;
      out[v] = { hourlyCap: cap, sent, remaining: Math.max(0, cap - sent) };
    })
  );

  const campaignCap = camp?.campaign_hourly_cap ?? 1000;
  const campaignRemaining = Math.max(
    0,
    campaignCap - (sentCampaignLastHour ?? 0)
  );

  return { perVariant: out, campaign: { cap: campaignCap, remaining: campaignRemaining } };
}

