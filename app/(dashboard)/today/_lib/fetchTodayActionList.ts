import { SupabaseClient } from "@supabase/supabase-js";

export type TodayJobItem = {
  job_id: string;
  homeowner_name: string | null;
  homeowner_email: string | null;
  homeowner_phone: string | null;
  latest_score: number | null;
  score_bucket: "hot" | "warm" | "cold" | null;
  last_calculated_at: string | null;
};

export type TodayActionList = {
  hotCalls: TodayJobItem[];
  warmFollowUps: TodayJobItem[];
  coldRevives: TodayJobItem[];
};

export async function fetchTodayActionList(
  supabase: SupabaseClient,
  orgId: string
): Promise<TodayActionList> {
  const now = new Date();
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(now.getDate() - 3);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  // HOT: recent, high score
  const { data: hot, error: hotError } = await supabase
    .from("roofing_jobs_with_health")
    .select(
      "job_id, homeowner_name, homeowner_email, homeowner_phone, latest_score, score_bucket, last_calculated_at"
    )
    .eq("org_id", orgId)
    .eq("score_bucket", "hot")
    .gte("last_calculated_at", threeDaysAgo.toISOString())
    .order("latest_score", { ascending: false })
    .limit(10);

  if (hotError) console.error("Today hot list error", hotError);

  // WARM follow-ups: warm score and overdue outbound follow-up
  const { data: warm, error: warmError } = await supabase.rpc(
    "get_warm_jobs_needing_followup",
    { _org_id: orgId }
  );

  if (warmError) console.error("Today warm list error", warmError);

  // COLD revive: cold score, relatively recent, no reply yet
  const { data: cold, error: coldError } = await supabase.rpc(
    "get_cold_jobs_to_revive",
    {
      _org_id: orgId,
      _since: thirtyDaysAgo.toISOString(),
    }
  );

  if (coldError) console.error("Today cold list error", coldError);

  return {
    hotCalls: (hot ?? []) as TodayJobItem[],
    warmFollowUps: (warm ?? []) as TodayJobItem[],
    coldRevives: (cold ?? []) as TodayJobItem[],
  };
}

