import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId");
  const scenario = url.searchParams.get("scenario");

  if (!campaignId || !scenario) {
    return NextResponse.json(
      { error: "campaignId and scenario are required" },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ error: "Supabase credentials not configured" }, { status: 500 });
  }

  const client = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const { data, error } = await client
    .from("v_nudge_variant_stats")
    .select("campaign_id, scenario, variant_id, name, is_active, samples, successes, avg_reward, posterior_mean")
    .eq("campaign_id", campaignId)
    .eq("scenario", scenario)
    .order("avg_reward", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const variants = data ?? [];
  if (variants.length === 0) {
    return NextResponse.json([]);
  }

  const variantIds = variants.map((row) => row.variant_id);
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 6);

  const { data: outcomes, error: outcomesError } = await client
    .from("nudge_outcomes")
    .select("variant_id, reward, created_at")
    .eq("campaign_id", campaignId)
    .eq("scenario", scenario)
    .in("variant_id", variantIds)
    .gte("created_at", since.toISOString());

  if (outcomesError) {
    return NextResponse.json({ error: outcomesError.message }, { status: 500 });
  }

  const buckets = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const outcome of outcomes ?? []) {
    const variantBucket = buckets.get(outcome.variant_id) ?? new Map<string, { sum: number; count: number }>();
    const dayKey = outcome.created_at.slice(0, 10);
    const stats = variantBucket.get(dayKey) ?? { sum: 0, count: 0 };
    stats.sum += Number(outcome.reward ?? 0);
    stats.count += 1;
    variantBucket.set(dayKey, stats);
    buckets.set(outcome.variant_id, variantBucket);
  }

  const timelineKeys = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(since);
    d.setDate(since.getDate() + idx);
    return d.toISOString().slice(0, 10);
  });

  const enriched = variants.map((row) => {
    const variantBucket = buckets.get(row.variant_id) ?? new Map<string, { sum: number; count: number }>();
    const sparkline = timelineKeys.map((key) => {
      const entry = variantBucket.get(key);
      const value = entry && entry.count > 0 ? entry.sum / entry.count : 0;
      return { day: key, value };
    });
    return { ...row, sparkline };
  });

  return NextResponse.json(enriched);
}
