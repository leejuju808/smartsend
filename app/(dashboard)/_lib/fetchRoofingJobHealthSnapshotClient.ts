"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import type { RoofingHealthSnapshot } from "./fetchRoofingJobHealthSnapshot";

export async function fetchRoofingJobHealthSnapshotClient(
  supabase: SupabaseClient,
  orgId: string
): Promise<RoofingHealthSnapshot> {
  const { data, error } = await supabase
    .from("roofing_job_health_scores")
    .select("latest_score, score_bucket, last_calculated_at")
    .eq("org_id", orgId);

  if (error || !data || data.length === 0) {
    return {
      avgScore: 0,
      hotCount: 0,
      warmCount: 0,
      coldCount: 0,
      lastUpdated: null,
    };
  }

  let totalScore = 0;
  let hotCount = 0;
  let warmCount = 0;
  let coldCount = 0;
  let latestTimestamp: string | null = null;

  for (const row of data) {
    const score = row.latest_score ?? 0;
    totalScore += score;

    if (row.score_bucket === "hot") hotCount += 1;
    else if (row.score_bucket === "warm") warmCount += 1;
    else coldCount += 1;

    const ts = row.last_calculated_at as string | null;
    if (ts && (!latestTimestamp || new Date(ts) > new Date(latestTimestamp))) {
      latestTimestamp = ts;
    }
  }

  const avgScore = Math.round(totalScore / data.length);

  return {
    avgScore,
    hotCount,
    warmCount,
    coldCount,
    lastUpdated: latestTimestamp,
  };
}















































